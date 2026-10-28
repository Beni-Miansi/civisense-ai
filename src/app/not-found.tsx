import Link from 'next/link';

export default function PageIntrouvable() {
  return (
    <div className="space-y-3 rounded-xl bg-white p-6 text-center ring-1 ring-slate-200">
      <h1 className="text-lg font-bold">Page introuvable</h1>
      <p className="text-slate-600">Ce contenu n&apos;existe pas ou vous n&apos;avez pas l&apos;autorisation de le consulter.</p>
      <Link href="/" className="inline-block font-semibold text-marque-700 underline">Retour à l&apos;accueil</Link>
    </div>
  );
}
