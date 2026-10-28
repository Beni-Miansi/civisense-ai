import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { getUtilisateur } from '@/lib/auth';
import { classerParMotsCles, type Suggestion } from '@/lib/classification';
import type { Categorie } from '@/lib/domaine';

// Classification de catégorie côté serveur : les clés d'API n'atteignent jamais le navigateur.
// Fournisseurs : Claude (ANTHROPIC_API_KEY) puis Groq gratuit (GROQ_API_KEY), le suivant prenant le relais en cas d'échec.
// Repli par mots-clés si aucune clé, si tout échoue ou au-delà de 3 s (la démo ne dépend pas du réseau).

const DELAI_MS = 3000;
const MODELE_CLAUDE = process.env.CLASSIFICATION_MODEL || 'claude-opus-5-5';
const MODELE_GROQ = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';

const Reponse = z.object({
  categorie: z.enum(['dechets', 'voirie', 'assainissement', 'eclairage', 'autre'] satisfies Categorie[]),
  confiance: z.number(),
  justification: z.string(),
});
type Reponse = z.infer<typeof Reponse>;

const CONSIGNES = `Tu aides les habitants de Dakar à classer un signalement de problème urbain.
Catégories possibles :
- assainissement : caniveaux, égouts, eaux usées ou stagnantes, inondations, fosses
- dechets : ordures, dépôts sauvages, bacs non collectés, déchets brûlés, gravats
- voirie : chaussée, nids-de-poule, trottoirs, routes dégradées
- eclairage : lampadaires, éclairage public en panne, rues sombres
- autre : tout ce qui ne relève clairement d'aucune catégorie ci-dessus
Le texte peut être en français, contenir du wolof ou des fautes. Choisis la catégorie la plus probable.
confiance : nombre entre 0 et 1 reflétant l'ambiguïté réelle du texte (texte vague ou mixte → valeur basse).
justification : une phrase courte en français (15 mots maximum), sans formule de certitude.`;

const versSuggestion = ({ categorie, confiance, justification }: Reponse): Suggestion => ({
  categorie,
  confiance: Math.round(Math.min(1, Math.max(0, confiance)) * 100) / 100,
  justification: justification.slice(0, 200),
  source: 'ia',
});

let client: Anthropic | null = null;

async function classerParClaude(texte: string, delai: number): Promise<Suggestion | null> {
  client ??= new Anthropic();
  const reponse = await client.messages.parse(
    {
      model: MODELE_CLAUDE,
      max_tokens: 1024,
      system: CONSIGNES,
      output_config: { effort: 'low', format: zodOutputFormat(Reponse) },
      messages: [{ role: 'user', content: `Signalement :\n${texte}` }],
    },
    { timeout: delai, maxRetries: 0 },
  );
  if (reponse.stop_reason === 'refusal' || !reponse.parsed_output) return null;
  return versSuggestion(reponse.parsed_output);
}

// Groq : API compatible OpenAI, réponse JSON validée par le même schéma.
async function classerParGroq(texte: string, delai: number): Promise<Suggestion | null> {
  const reponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODELE_GROQ,
      temperature: 0,
      reasoning_effort: 'low',
      max_completion_tokens: 600,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: `${CONSIGNES}\nRéponds uniquement en JSON : {"categorie": "...", "confiance": 0.0, "justification": "..."}`,
        },
        { role: 'user', content: `Signalement :\n${texte}` },
      ],
    }),
    signal: AbortSignal.timeout(delai),
  });
  if (!reponse.ok) throw new Error(`Groq ${reponse.status}`);
  const corps = (await reponse.json()) as { choices?: { message?: { content?: string } }[] };
  const resultat = Reponse.safeParse(JSON.parse(corps.choices?.[0]?.message?.content ?? 'null'));
  return resultat.success ? versSuggestion(resultat.data) : null;
}

export async function POST(requete: Request) {
  // Réservé aux utilisateurs connectés : la route ne doit pas servir de relais ouvert vers l'API.
  if (!(await getUtilisateur())) return Response.json({ erreur: 'Connexion requise' }, { status: 401 });

  const corps = (await requete.json().catch(() => null)) as { texte?: unknown } | null;
  const texte = typeof corps?.texte === 'string' ? corps.texte.trim().slice(0, 2000) : '';
  if (texte.length < 5) return Response.json({ suggestion: null });

  // Fournisseurs configurés, essayés dans l'ordre tant que le délai global de 3 s n'est pas écoulé.
  const fournisseurs = [
    { nom: 'Claude', classer: classerParClaude, actif: Boolean(process.env.ANTHROPIC_API_KEY) },
    { nom: 'Groq', classer: classerParGroq, actif: Boolean(process.env.GROQ_API_KEY) },
  ].filter((f) => f.actif);
  const fin = Date.now() + DELAI_MS;
  for (const { nom, classer } of fournisseurs) {
    const reste = fin - Date.now();
    if (reste < 300) break;
    try {
      const suggestion = await classer(texte, reste);
      if (suggestion) return Response.json({ suggestion });
    } catch (erreur) {
      // Délai dépassé, réseau, quota, crédit… : fournisseur suivant, puis mots-clés.
      console.warn(`Classification ${nom} indisponible :`, erreur instanceof Error ? erreur.message : erreur);
    }
  }
  return Response.json({ suggestion: classerParMotsCles(texte) });
}
