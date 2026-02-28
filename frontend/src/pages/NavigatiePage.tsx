import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trash2, Plus, Search, X, ExternalLink } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/services/api';
import type { MapPin as MapPinType } from '@/types';

// Fix Leaflet default icon paths broken by bundlers
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const PIN_COLORS: Record<string, string> = {
  blue:   '#2563eb',
  red:    '#dc2626',
  green:  '#16a34a',
  orange: '#ea580c',
  purple: '#9333ea',
};

function makeIcon(color: string) {
  const c = PIN_COLORS[color] ?? PIN_COLORS.blue;
  const svg = encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36"><path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24S24 21 24 12C24 5.373 18.627 0 12 0z" fill="${c}"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`);
  return L.icon({
    iconUrl:    `data:image/svg+xml,${svg}`,
    iconSize:   [24, 36],
    iconAnchor: [12, 36],
    popupAnchor:[0, -36],
  });
}

function FitBoundsOnLoad({ pins }: { pins: MapPinType[] }) {
  const map = useMap();
  React.useEffect(() => {
    if (pins.length === 0) return;
    const bounds = L.latLngBounds(pins.map(p => [p.lat, p.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [50, 50], maxZoom: 16 });
  }, [pins.length]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onMapClick(e.latlng.lat, e.latlng.lng); },
  });
  return null;
}

interface AddPinForm {
  lat: number;
  lng: number;
  name: string;
  address: string;
  color: string;
}

export const NavigatiePage: React.FC = () => {
  const queryClient = useQueryClient();
  const [addMode, setAddMode]     = useState(false);
  const [form, setForm]           = useState<AddPinForm | null>(null);
  const [searchQ, setSearchQ]     = useState('');
  const [searchResults, setSearchResults] = useState<{ lat: string; lon: string; display_name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  const { data: pins = [] } = useQuery<MapPinType[]>({
    queryKey: ['map-pins'],
    queryFn: () => api.getMapPins(),
  });

  const { data: traccarData } = useQuery({
    queryKey: ['traccar-token'],
    queryFn:  () => api.getTraccarToken(),
    staleTime: 5 * 60 * 1000,
  });

  const createPin = useMutation({
    mutationFn: (p: Omit<AddPinForm, ''>) =>
      api.createMapPin({ name: p.name, address: p.address || undefined, lat: p.lat, lng: p.lng, color: p.color }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-pins'] });
      setForm(null);
      setAddMode(false);
      toast.success('Pin adăugat');
    },
    onError: () => toast.error('Eroare la adăugare pin'),
  });

  const deletePin = useMutation({
    mutationFn: (id: number) => api.deleteMapPin(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-pins'] });
      toast.success('Pin șters');
    },
  });

  // Geocode search with debounce
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!searchQ.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.geocodeAddress(searchQ);
        setSearchResults(results);
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 600);
  }, [searchQ]);

  const handleMapClick = (lat: number, lng: number) => {
    if (!addMode) return;
    setForm({ lat, lng, name: '', address: '', color: 'blue' });
  };

  const handleSearchResultClick = (r: { lat: string; lon: string; display_name: string }) => {
    setForm({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      name: r.display_name.split(',')[0],
      address: r.display_name,
      color: 'blue',
    });
    setSearchQ('');
    setSearchResults([]);
    setAddMode(true);
  };

  return (
    <div className="-m-4 lg:-m-6 h-[calc(100vh-56px)] lg:h-screen overflow-hidden flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shrink-0 z-[1000] flex-wrap">
        {/* Search geocoding */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-stone-400 pointer-events-none" />
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder="Caută adresă..."
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-800 text-stone-900 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          {searching && (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-stone-400">...</span>
          )}
          {searchResults.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-600 rounded-lg shadow-lg z-[2000] max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button
                  key={i}
                  onClick={() => handleSearchResultClick(r)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-700 border-b border-stone-100 dark:border-stone-700 last:border-0"
                >
                  <p className="font-medium text-stone-800 dark:text-stone-100 truncate">{r.display_name.split(',')[0]}</p>
                  <p className="text-xs text-stone-400 truncate">{r.display_name}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add mode toggle */}
        <button
          onClick={() => { setAddMode(m => !m); setForm(null); }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
            addMode
              ? 'bg-blue-600 text-white hover:bg-blue-700'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
          {addMode ? 'Click pe hartă...' : 'Adaugă pin'}
        </button>

        {/* Traccar link */}
        {traccarData?.url && (
          <a
            href={traccarData.token ? `${traccarData.url}?token=${traccarData.token}` : traccarData.url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Traccar
          </a>
        )}

        <span className="ml-auto text-xs text-stone-400">{pins.length} pini</span>
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <MapContainer
          center={[44.548, 26.215]}
          zoom={14}
          style={{ height: '100%', width: '100%', cursor: addMode ? 'crosshair' : 'grab' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBoundsOnLoad pins={pins} />
          <MapClickHandler onMapClick={handleMapClick} />

          {/* Saved pins */}
          {pins.map(pin => (
            <Marker key={pin.id} position={[pin.lat, pin.lng]} icon={makeIcon(pin.color)}>
              <Tooltip permanent direction="top" offset={[0, -36]} className="leaflet-pin-label">
                <span style={{ display: 'block', fontWeight: 700 }}>{pin.name}</span>
                {pin.note && <span style={{ display: 'block', fontSize: '10px', opacity: 0.75 }}>{pin.note}</span>}
              </Tooltip>
              <Popup>
                <div className="min-w-[160px]">
                  <p className="font-semibold text-stone-800">{pin.name}</p>
                  {pin.address && <p className="text-xs text-stone-500 mt-0.5">{pin.address}</p>}
                  <p className="text-[10px] text-stone-400 mt-1">{pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}</p>
                  <button
                    onClick={() => deletePin.mutate(pin.id)}
                    className="mt-2 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" /> Șterge pin
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Pending new pin (not yet saved) */}
          {form && (
            <Marker position={[form.lat, form.lng]} icon={makeIcon(form.color)} opacity={0.7}>
              <Popup autoOpen>
                <div className="min-w-[200px] space-y-2">
                  <p className="font-semibold text-stone-800 text-sm">Pin nou</p>
                  <input
                    autoFocus
                    placeholder="Nume *"
                    value={form.name}
                    onChange={e => setForm(f => f ? { ...f, name: e.target.value } : f)}
                    className="w-full text-sm px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <input
                    placeholder="Adresă (opțional)"
                    value={form.address}
                    onChange={e => setForm(f => f ? { ...f, address: e.target.value } : f)}
                    className="w-full text-sm px-2 py-1 border border-stone-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex gap-1">
                    {Object.entries(PIN_COLORS).map(([key, hex]) => (
                      <button
                        key={key}
                        onClick={() => setForm(f => f ? { ...f, color: key } : f)}
                        style={{ background: hex }}
                        className={`w-5 h-5 rounded-full border-2 ${form.color === key ? 'border-stone-800' : 'border-transparent'}`}
                        title={key}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => createPin.mutate(form)}
                      disabled={!form.name.trim() || createPin.isPending}
                      className="flex-1 py-1 text-xs font-medium bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      Salvează
                    </button>
                    <button
                      onClick={() => { setForm(null); setAddMode(false); }}
                      className="px-2 py-1 text-xs text-stone-500 hover:text-stone-700"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </Popup>
            </Marker>
          )}
        </MapContainer>
      </div>
    </div>
  );
};
