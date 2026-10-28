'use client';

import 'leaflet/dist/leaflet.css';
import Link from 'next/link';
import { useEffect } from 'react';
import { MapContainer, Marker, Popup, TileLayer, useMap } from 'react-leaflet';
import { BadgeStatut } from '@/components/BadgeStatut';
import { CATEGORIES, CENTRE_CARTE, type PointCarte } from '@/lib/domaine';
import { iconeCategorie } from './marqueurs';

export type ProprietesCarte = {
  points: PointCarte[];
  zoom?: number;
  hauteur?: string;      // classe Tailwind de hauteur
  ajuster?: boolean;     // cadrer automatiquement sur l'ensemble des points
};

function Cadrage({ points }: { points: PointCarte[] }) {
  const carte = useMap();
  useEffect(() => {
    if (points.length > 1) {
      carte.fitBounds(points.map((p) => [p.lat, p.lng] as [number, number]), { padding: [30, 30], maxZoom: 16 });
    }
  }, [carte, points]);
  return null;
}

export default function CarteSignalements({ points, zoom = 14, hauteur = 'h-[60vh]', ajuster = true }: ProprietesCarte) {
  const centre = points.length === 1 ? points[0] : CENTRE_CARTE;
  return (
    <div className={`isolate overflow-hidden rounded-xl ring-1 ring-slate-200 ${hauteur}`}>
      <MapContainer center={[centre.lat, centre.lng]} zoom={zoom} scrollWheelZoom className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {ajuster && <Cadrage points={points} />}
        {points.map((p) => (
          <Marker
            key={p.id}
            position={[p.lat, p.lng]}
            icon={iconeCategorie(p.categorie, p.statut === 'resolu' || p.statut === 'cloture')}
          >
            <Popup>
              <div className="min-w-44 space-y-1.5">
                <p className="m-0! text-sm font-semibold text-slate-900">{p.titre}</p>
                <div className="flex items-center gap-2">
                  <BadgeStatut statut={p.statut} />
                  <span className="text-xs text-slate-500">{CATEGORIES[p.categorie].libelle}</span>
                </div>
                {p.approximatif && <p className="m-0! text-xs text-slate-500">Position approximative (~100 m)</p>}
                {p.lien && (
                  <Link href={p.lien} className="inline-block text-sm font-semibold text-marque-700! underline">
                    Voir le détail
                  </Link>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
