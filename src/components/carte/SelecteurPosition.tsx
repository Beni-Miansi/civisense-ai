'use client';

import 'leaflet/dist/leaflet.css';
import type { Marker as MarqueurLeaflet } from 'leaflet';
import { useEffect } from 'react';
import { MapContainer, Marker, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { CENTRE_CARTE, type Position } from '@/lib/domaine';
import { iconePosition } from './marqueurs';

export type ProprietesSelecteur = {
  position: Position | null;
  onChange: (position: Position) => void;
  recentrage: number;    // incrémenté quand la carte doit se recentrer (position GPS)
};

function Interactions({ position, onChange, recentrage }: ProprietesSelecteur) {
  const carte = useMap();
  useMapEvents({ click: (e) => onChange({ lat: e.latlng.lat, lng: e.latlng.lng }) });

  useEffect(() => {
    if (recentrage > 0 && position) carte.setView([position.lat, position.lng], Math.max(carte.getZoom(), 17));
    // Recentrer seulement sur demande (GPS), pas à chaque clic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentrage]);
  return null;
}

export default function SelecteurPosition(props: ProprietesSelecteur) {
  const { position, onChange } = props;
  return (
    <div className="isolate h-72 overflow-hidden rounded-xl ring-1 ring-slate-300 sm:h-80">
      <MapContainer center={[CENTRE_CARTE.lat, CENTRE_CARTE.lng]} zoom={14} className="size-full">
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <Interactions {...props} />
        {position && (
          <Marker
            position={[position.lat, position.lng]}
            icon={iconePosition}
            draggable
            eventHandlers={{
              dragend: (e) => {
                const { lat, lng } = (e.target as MarqueurLeaflet).getLatLng();
                onChange({ lat, lng });
              },
            }}
          />
        )}
      </MapContainer>
    </div>
  );
}
