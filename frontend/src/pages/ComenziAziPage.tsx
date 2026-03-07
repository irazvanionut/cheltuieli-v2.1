import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw, MapPin, Package, Truck, Phone, Copy, Check,
  Map, AlertCircle, Loader2, X, Route, ArrowRightLeft,
  ExternalLink, RotateCcw, Navigation,
} from 'lucide-react';
import { clsx } from 'clsx';
import { toast } from 'react-hot-toast';
import api from '@/services/api';

const DRIVER_COLORS = ['#2563eb', '#ea580c', '#16a34a', '#9333ea', '#dc2626'];  // blue, orange, green, purple, red
const DRIVER_BG = ['bg-blue-500', 'bg-orange-500', 'bg-green-600', 'bg-purple-600', 'bg-red-600'];

// ─── Google Maps helpers ───────────────────────────────────────────────────────

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById('gmaps-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=weekly`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps JS failed to load'));
    document.head.appendChild(script);
  });
}

function makeNumMarkerSvg(num: number, color: string) {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 38" width="28" height="38">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 28 14 28S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="${color}"/>
      <circle cx="14" cy="14" r="9" fill="white"/>
      <text x="14" y="18.5" text-anchor="middle" font-size="11" font-weight="bold" fill="${color}" font-family="sans-serif">${num}</text>
    </svg>`
  )}`;
}

function makeRestaurantMarkerSvg() {
  return `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 38" width="28" height="38">
      <path d="M14 0C6.268 0 0 6.268 0 14c0 10.5 14 28 14 28S28 24.5 28 14C28 6.268 21.732 0 14 0z" fill="#16a34a"/>
      <circle cx="14" cy="14" r="9" fill="white"/>
      <text x="14" y="18.5" text-anchor="middle" font-size="10" fill="#16a34a" font-family="sans-serif">🏠</text>
    </svg>`
  )}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface Comanda {
  id: string;
  number: number;
  time: string;
  customer_name: string;
  address: string;
  phone: string;
  total: number;
  status: number;
  status_label: string;
  status_color: string;
  is_ridicare: boolean;
  created_at: string;
  lat?: number | null;
  lng?: number | null;
  travel_time_min?: number | null;
  eta_delivery?: string | null;
  eta_return?: string | null;
}

// ─── Status badge ─────────────────────────────────────────────────────────────
const STATUS_CLS: Record<string, string> = {
  green:  'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  orange: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  red:    'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400',
  blue:   'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

const StatusBadge: React.FC<{ label: string; color: string }> = ({ label, color }) => (
  <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold', STATUS_CLS[color] ?? STATUS_CLS.blue)}>
    {label}
  </span>
);

// ─── Mark Pin Modal ───────────────────────────────────────────────────────────
interface MarkModalProps {
  comanda: Comanda;
  onConfirm: (address: string) => void;
  onClose: () => void;
  isPending: boolean;
}
const MarkModal: React.FC<MarkModalProps> = ({ comanda, onConfirm, onClose, isPending }) => {
  const [address, setAddress] = useState(comanda.address ?? '');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-stone-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-blue-500" />
            <h3 className="font-semibold text-stone-800 dark:text-stone-100">Marchează pe hartă</h3>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 dark:hover:text-stone-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div>
          <p className="text-sm font-medium text-stone-700 dark:text-stone-200 mb-1 capitalize">
            {comanda.customer_name?.toLowerCase()}
          </p>
          <StatusBadge label={comanda.status_label} color={comanda.status_color} />
        </div>

        <div>
          <label className="block text-xs font-medium text-stone-500 dark:text-stone-400 mb-1.5">
            Adresă pentru geocodare
          </label>
          <input
            ref={inputRef}
            value={address}
            onChange={e => setAddress(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !isPending && address.trim() && onConfirm(address.trim())}
            className="w-full px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-stone-50 dark:bg-stone-700 text-stone-900 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Strada, număr, localitate..."
          />
          <p className="text-[11px] text-stone-400 mt-1">
            Poți edita adresa dacă cea din ERP nu e exactă. Dacă nu specifici orașul, se caută în Ilfov.
          </p>
        </div>

        <div className="flex gap-2 pt-1">
          <button
            onClick={() => address.trim() && onConfirm(address.trim())}
            disabled={isPending || !address.trim()}
            className="flex-1 flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
            {isPending ? 'Geocodare...' : 'Adaugă pin'}
          </button>
          <button
            onClick={onClose}
            disabled={isPending}
            className="px-4 py-2 rounded-lg border border-stone-300 dark:border-stone-600 text-sm text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            Anulează
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Route Modal ──────────────────────────────────────────────────────────────
const RUTE_PIN = '2910';

interface RouteStop { id: string; number: string; name: string; address: string; lat: number; lng: number; order: number; status_label?: string; status_color?: string; eta_delivery?: string | null; eta_return?: string | null; order_time?: string | null; }
interface RoutingResult { duration_min: number; return_min: number; total_min: number; duration_no_traffic_min?: number; return_no_traffic_min?: number; geometry: [number, number][]; available?: boolean; }
interface TripRoute { comenzi: RouteStop[]; osrm: RoutingResult | null; google: RoutingResult | { available: false }; maps_url: string; }
interface DriverRoute { sofer: number; curse: TripRoute[]; }
interface DriverLocal { sofer: number; curse: TripRoute[]; flatOrders: RouteStop[]; }
interface RuteData { soferi: DriverRoute[]; restaurant: { lat: number; lng: number }; }

function fmtMin(m: number) {
  const h = Math.floor(m / 60), min = Math.round(m % 60);
  return h > 0 ? `${h}h ${min}m` : `${min}m`;
}

const tripGoogleOk = (t: TripRoute) => (t.google as RoutingResult)?.available === true;
const getTripMain = (t: TripRoute): RoutingResult | null =>
  tripGoogleOk(t) ? (t.google as RoutingResult) : (t.osrm ?? null);

const RuteModal: React.FC<{
  comenzi: any[];
  onClose: () => void;
}> = ({ comenzi, onClose }) => {
  const [phase, setPhase] = useState<'pin' | 'engines' | 'loading' | 'results'>('pin');
  const [engines, setEngines] = useState<Set<string>>(new Set(['osrm', 'google']));
  const [nrSoferi, setNrSoferi] = useState(2);
  const [pin, setPin] = useState('');
  const [pinError, setPinError] = useState(false);
  const [ruteData, setRuteData] = useState<RuteData | null>(null);
  const [localSoferi, setLocalSoferi] = useState<DriverLocal[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [dirty, setDirty] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const mapDivRef = useRef<HTMLDivElement>(null);
  const gMapRef = useRef<any>(null);
  const routeObjsRef = useRef<any[]>([]);
  const infoWindowsRef = useRef<any[]>([]);

  // Get Google Maps API key
  const { data: settings = [] } = useQuery<any[]>({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 5 * 60 * 1000,
  });
  const apiKey = (settings as any[]).find((s: any) => s.cheie === 'google_maps_api_key')?.valoare || '';

  useEffect(() => { pinRef.current?.focus(); }, []);

  // ── Draw routes on Google Maps ──────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'results' || !ruteData || !apiKey || !mapDivRef.current) return;

    loadGoogleMapsScript(apiKey).then(() => {
      if (!mapDivRef.current) return;
      const g = (window as any).google;

      // Init map only once
      if (!gMapRef.current) {
        gMapRef.current = new g.maps.Map(mapDivRef.current, {
          center: { lat: ruteData.restaurant.lat, lng: ruteData.restaurant.lng },
          zoom: 12,
          mapTypeId: 'roadmap',
          fullscreenControl: false,
          streetViewControl: false,
          mapTypeControl: false,
        });
      }

      const map = gMapRef.current;

      // Clear previous route objects and info windows
      routeObjsRef.current.forEach(o => o.setMap(null));
      routeObjsRef.current = [];
      infoWindowsRef.current.forEach(iw => iw.close());
      infoWindowsRef.current = [];

      // Restaurant marker
      const restM = new g.maps.Marker({
        position: { lat: ruteData.restaurant.lat, lng: ruteData.restaurant.lng },
        map,
        title: 'Restaurant',
        zIndex: 100,
        icon: { url: makeRestaurantMarkerSvg(), scaledSize: new g.maps.Size(28, 38), anchor: new g.maps.Point(14, 38) },
      });
      routeObjsRef.current.push(restM);

      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: ruteData.restaurant.lat, lng: ruteData.restaurant.lng });

      localSoferi.forEach((driver, di) => {
        const color = DRIVER_COLORS[di];

        // Polylines per trip
        driver.curse.forEach(trip => {
          const geom = (tripGoogleOk(trip)
            ? (trip.google as RoutingResult).geometry
            : trip.osrm?.geometry) ?? [];
          if (geom.length === 0) return;
          const path = geom.map(([lat, lng]: [number, number]) => ({ lat, lng }));
          const polyline = di === 0
            ? new g.maps.Polyline({ path, map, strokeColor: color, strokeWeight: 4, strokeOpacity: 0.85 })
            : new g.maps.Polyline({
                path, map,
                strokeColor: color, strokeWeight: 4, strokeOpacity: 0,
                icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 1, scale: 4, strokeColor: color }, offset: '0', repeat: '18px' }],
              });
          routeObjsRef.current.push(polyline);
        });

        // Stop markers
        driver.flatOrders.forEach(stop => {
          const marker = new g.maps.Marker({
            position: { lat: stop.lat, lng: stop.lng },
            map,
            title: stop.name,
            icon: {
              url: makeNumMarkerSvg(stop.order, color),
              scaledSize: new g.maps.Size(28, 38),
              anchor: new g.maps.Point(14, 38),
              labelOrigin: new g.maps.Point(14, -8),
            },
            label: { text: stop.name, color: '#fff', fontSize: '10px', fontWeight: 'bold' },
          });
          routeObjsRef.current.push(marker);
          bounds.extend({ lat: stop.lat, lng: stop.lng });

          // InfoWindow with order time + ETA
          const iwContent = [
            `<div style="font-family:sans-serif;font-size:12px;line-height:1.7;min-width:150px">`,
            `<div style="font-weight:700;font-size:13px;margin-bottom:4px;text-transform:capitalize">${(stop.name ?? '').toLowerCase()}</div>`,
            stop.order_time ? `<div>🕐 Comandă: <b>${stop.order_time}</b></div>` : '',
            stop.eta_delivery ? `<div>📦 La client: <b style="color:#16a34a">${stop.eta_delivery}</b></div>` : '',
            stop.eta_return ? `<div>↩ Întoarcere: <b style="color:#6b7280">${stop.eta_return}</b></div>` : '',
            `</div>`,
          ].join('');
          const infoWindow = new g.maps.InfoWindow({ content: iwContent });
          marker.addListener('click', () => {
            infoWindowsRef.current.forEach(iw => iw.close());
            infoWindow.open(map, marker);
          });
          infoWindowsRef.current.push(infoWindow);
        });
      });

      // Fit bounds
      if (localSoferi.some(s => s.flatOrders.length > 0)) {
        requestAnimationFrame(() => map.fitBounds(bounds, { top: 40, right: 40, bottom: 40, left: 40 }));
      }
    });
  }, [phase, ruteData, apiKey, localSoferi]); // eslint-disable-line react-hooks/exhaustive-deps

  const calcMutation = useMutation({
    mutationFn: (payload: any) => api.calculeazaRute(payload),
    onSuccess: (data: RuteData) => {
      setRuteData(data);
      // Enrich route stops with ETA/time from original livrari
      const byId: Record<string, any> = {};
      (comenzi as any[]).forEach(c => { byId[c.id] = c; });
      setLocalSoferi(data.soferi.map(d => ({
        ...d,
        flatOrders: d.curse.flatMap(c => c.comenzi).map(stop => {
          const src = byId[stop.id];
          // Replicate table logic: prefer created_at slice, fall back to time field
          const order_time = src
            ? (src.created_at ? src.created_at.slice(11, 16) : src.time) || null
            : null;
          return {
            ...stop,
            eta_delivery: src?.eta_delivery ?? null,
            eta_return:   src?.eta_return   ?? null,
            order_time,
          };
        }),
      })));
      setDirty(false);
      setPhase('results');
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Eroare la calculul rutelor');
      setPhase('pin');
    },
  });

  const toggleEngine = (eng: string) => {
    setEngines(prev => {
      const next = new Set(prev);
      if (next.has(eng)) { if (next.size > 1) next.delete(eng); }
      else next.add(eng);
      return next;
    });
  };

  const handlePin = () => {
    if (pin === RUTE_PIN) {
      setPhase('engines');
    } else {
      setPinError(true);
      setPin('');
      setTimeout(() => { setPinError(false); pinRef.current?.focus(); }, 1000);
    }
  };

  const startCalc = (payload: any) => {
    setPhase('loading');
    calcMutation.mutate({ ...payload, engines: Array.from(engines), nr_soferi: nrSoferi });
  };

  const handleRecalc = () => {
    const sofer_ids = localSoferi.map(s => s.flatOrders.map(c => c.id));
    startCalc({ comenzi, sofer_ids, nr_soferi: localSoferi.length });
  };

  const moveStop = (fromDriver: number, stopId: string, toDriver: number) => {
    setLocalSoferi(prev => {
      const next = JSON.parse(JSON.stringify(prev)) as DriverLocal[];
      const idx = next[fromDriver].flatOrders.findIndex(o => o.id === stopId);
      if (idx === -1) return prev;
      const [stop] = next[fromDriver].flatOrders.splice(idx, 1);
      next[toDriver].flatOrders.push(stop);
      next[toDriver].flatOrders.sort((a, b) => a.order - b.order);
      next[fromDriver].curse = [];
      next[toDriver].curse = [];
      return next;
    });
    setDirty(true);
  };

  const activeDriver = localSoferi[activeTab];

  return (
    <div className="fixed inset-0 z-[2000] flex flex-col bg-stone-900/95">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-stone-900 border-b border-stone-700 shrink-0">
        <Navigation className="w-5 h-5 text-blue-400" />
        <span className="font-semibold text-stone-100">Rute Livrare</span>
        {phase === 'results' && dirty && (
          <button
            onClick={handleRecalc}
            disabled={calcMutation.isPending}
            className="flex items-center gap-1.5 ml-2 px-3 py-1 rounded-lg text-xs font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3" /> Recalculează
          </button>
        )}
        <button onClick={onClose} className="ml-auto text-stone-400 hover:text-stone-200 transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* PIN gate */}
      {phase === 'pin' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-stone-800 rounded-2xl border border-stone-700 p-8 w-full max-w-xs text-center space-y-4">
            <Route className="w-10 h-10 text-blue-400 mx-auto" />
            <p className="text-stone-300 text-sm">Introdu PIN pentru a calcula rutele</p>
            <input
              ref={pinRef}
              type="password"
              value={pin}
              onChange={e => { setPin(e.target.value); setPinError(false); }}
              onKeyDown={e => e.key === 'Enter' && handlePin()}
              maxLength={6}
              className={clsx(
                'w-full px-4 py-2.5 text-center text-xl font-mono rounded-xl border bg-stone-900 text-stone-100 outline-none transition-all',
                pinError ? 'border-red-500 bg-red-950/20' : 'border-stone-600 focus:border-blue-500'
              )}
            />
            {pinError && <p className="text-xs text-red-400">PIN incorect</p>}
            <button
              onClick={handlePin}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors"
            >
              Calculează
            </button>
          </div>
        </div>
      )}

      {/* Engine selection */}
      {phase === 'engines' && (
        <div className="flex-1 flex items-center justify-center">
          <div className="bg-stone-800 rounded-2xl border border-stone-700 p-8 w-full max-w-sm space-y-5">
            <div className="flex items-center gap-2">
              <Route className="w-6 h-6 text-blue-400" />
              <h3 className="font-semibold text-stone-100">Selecteaza engine-uri rutare</h3>
            </div>
            <p className="text-xs text-stone-400">Alege cu ce sa calculezi rutele. Poti bifa mai multe.</p>
            <div className="space-y-3">
              {[
                { key: 'osrm',    label: 'OSRM',              desc: 'Fara trafic real · Gratuit · Rapid',      color: '#2563eb' },
                { key: 'google',  label: 'Google Directions',  desc: 'Trafic real · $10/1000 apeluri',         color: '#16a34a' },
                { key: 'routexl', label: 'RouteXL',            desc: 'Optimizare TSP · Necesita API key · TBD', color: '#ea580c', disabled: true },
              ].map(eng => (
                <label
                  key={eng.key}
                  className={clsx(
                    'flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors',
                    eng.disabled
                      ? 'border-stone-700 opacity-40 cursor-not-allowed'
                      : engines.has(eng.key)
                        ? 'border-blue-500 bg-blue-950/20'
                        : 'border-stone-700 hover:border-stone-500'
                  )}
                >
                  <input
                    type="checkbox"
                    checked={engines.has(eng.key)}
                    disabled={eng.disabled}
                    onChange={() => !eng.disabled && toggleEngine(eng.key)}
                    className="mt-0.5 accent-blue-500"
                  />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: eng.color }} />
                      <span className="text-sm font-medium text-stone-200">{eng.label}</span>
                      {eng.disabled && <span className="text-[10px] text-stone-500 bg-stone-700 px-1.5 py-0.5 rounded">coming soon</span>}
                    </div>
                    <p className="text-[11px] text-stone-400 mt-0.5">{eng.desc}</p>
                  </div>
                </label>
              ))}
            </div>
            {/* Driver count */}
            <div className="flex items-center justify-between px-1">
              <span className="text-sm text-stone-300">Număr șoferi</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setNrSoferi(n => Math.max(1, n - 1))}
                  className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold transition-colors flex items-center justify-center"
                >−</button>
                <span className="text-stone-100 font-mono font-bold w-5 text-center">{nrSoferi}</span>
                <button
                  onClick={() => setNrSoferi(n => Math.min(5, n + 1))}
                  className="w-7 h-7 rounded-lg bg-stone-700 hover:bg-stone-600 text-stone-200 font-bold transition-colors flex items-center justify-center"
                >+</button>
              </div>
            </div>

            <button
              onClick={() => startCalc({ comenzi })}
              disabled={engines.size === 0}
              className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium transition-colors disabled:opacity-50"
            >
              Calculeaza Rutele
            </button>
          </div>
        </div>
      )}

      {/* Loading */}
      {phase === 'loading' && (
        <div className="flex-1 flex items-center justify-center gap-3 text-stone-300">
          <Loader2 className="w-6 h-6 animate-spin text-blue-400" />
          <span>Se calculează rutele (OSRM + Google)...</span>
        </div>
      )}

      {/* Results */}
      {phase === 'results' && ruteData && (
        <div className="flex-1 flex overflow-hidden">
          {/* Map */}
          <div className="flex-1 relative">
            <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />

            {/* Map legend */}
            <div className="absolute bottom-3 left-3 z-[1000] bg-white/90 dark:bg-stone-800/90 rounded-lg px-3 py-2 text-xs space-y-1 shadow-md pointer-events-none">
              {localSoferi.map((_, di) => (
                <div key={di} className="flex items-center gap-2">
                  {di === 0
                    ? <div className="w-6 h-1 rounded" style={{ background: DRIVER_COLORS[di] }} />
                    : <div className="w-6 h-0.5 border-t-2 border-dashed" style={{ borderColor: DRIVER_COLORS[di] }} />
                  }
                  <span className="text-stone-700 dark:text-stone-200">Șofer {di + 1}</span>
                </div>
              ))}
              {localSoferi[0]?.curse[0] && (
                <div className="text-stone-400 text-[10px]">
                  {tripGoogleOk(localSoferi[0].curse[0]) ? '🟢 Google (trafic)' : '⚪ OSRM (fără trafic)'}
                </div>
              )}
            </div>
          </div>

          {/* Side panel */}
          <div className="w-80 bg-stone-900 border-l border-stone-700 flex flex-col overflow-hidden">
            {/* Driver tabs */}
            <div className="flex border-b border-stone-700 shrink-0">
              {localSoferi.map((driver, di) => (
                <button
                  key={di}
                  onClick={() => setActiveTab(di)}
                  className={clsx(
                    'flex-1 py-2.5 text-sm font-medium transition-colors',
                    activeTab === di ? 'text-white border-b-2' : 'text-stone-400 hover:text-stone-200'
                  )}
                  style={activeTab === di ? { borderColor: DRIVER_COLORS[di] } : {}}
                >
                  <span className="flex items-center justify-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ background: DRIVER_COLORS[di] }} />
                    Șofer {di + 1}
                    <span className="text-[10px] text-stone-500">({driver.flatOrders.length})</span>
                  </span>
                </button>
              ))}
            </div>

            {activeDriver && (
              <div className="flex-1 overflow-y-auto">
                {dirty ? (
                  /* After swap — flat list, no timing until recalc */
                  <div className="divide-y divide-stone-800">
                    <div className="px-4 py-2 bg-amber-900/20">
                      <p className="text-xs text-amber-400">Apasă Recalculează pentru durate actualizate</p>
                    </div>
                    {activeDriver.flatOrders.map(stop => (
                      <div key={stop.id} className="px-4 py-3 flex items-start gap-3">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: DRIVER_COLORS[activeTab] }}>
                          {stop.order}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-stone-200 truncate capitalize">{stop.name?.toLowerCase()}</p>
                          <p className="text-[11px] text-stone-500 truncate">{stop.address}</p>
                        </div>
                        <div className="shrink-0 flex gap-1">
                          {localSoferi.map((_, di) => di !== activeTab && (
                            <button
                              key={di}
                              onClick={() => moveStop(activeTab, stop.id, di)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
                              title={`Mută la Șofer ${di + 1}`}
                            >
                              <ArrowRightLeft className="w-3 h-3" />
                              <span className="w-2 h-2 rounded-full inline-block" style={{ background: DRIVER_COLORS[di] }} />
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {activeDriver.flatOrders.length === 0 && (
                      <p className="px-4 py-6 text-sm text-stone-500 italic text-center">Nicio livrare</p>
                    )}
                  </div>
                ) : (
                  /* Clean state — per-trip breakdown */
                  <div>
                    {activeDriver.curse.map((trip, ti) => {
                      const main = getTripMain(trip);
                      const hasGoogle = tripGoogleOk(trip);
                      const googleRes = trip.google as RoutingResult;
                      const trafficDus = hasGoogle
                        ? trip.osrm
                          ? Math.max(0, googleRes.duration_min - trip.osrm.duration_min)
                          : googleRes.duration_no_traffic_min != null
                            ? Math.max(0, googleRes.duration_min - googleRes.duration_no_traffic_min)
                            : null
                        : null;
                      const trafficRetur = hasGoogle
                        ? trip.osrm
                          ? Math.max(0, googleRes.return_min - trip.osrm.return_min)
                          : googleRes.return_no_traffic_min != null
                            ? Math.max(0, googleRes.return_min - googleRes.return_no_traffic_min)
                            : null
                        : null;
                      const multi = activeDriver.curse.length > 1;

                      return (
                        <div key={ti} className="border-b border-stone-800">
                          {/* Trip header */}
                          {multi && (
                            <div className="px-4 pt-3 pb-1 flex items-center gap-2">
                              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ background: DRIVER_COLORS[activeTab] }}>
                                {ti + 1}
                              </span>
                              <span className="text-xs font-semibold text-stone-300">Cursa {ti + 1}</span>
                              <span className="text-[10px] text-stone-500">{trip.comenzi.length} opriri</span>
                            </div>
                          )}

                          {/* Timing */}
                          <div className="px-4 py-2 space-y-1">
                            {main ? (
                              <>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-stone-400">Timp dus</span>
                                  <span className="flex items-center gap-1.5">
                                    <span className={clsx('font-mono font-semibold', hasGoogle ? 'text-emerald-300' : 'text-stone-200')}>
                                      {fmtMin(main.duration_min)}
                                    </span>
                                    {trafficDus !== null && trafficDus > 0 && (
                                      <span className="text-amber-400 text-[10px]">+{fmtMin(trafficDus)} trafic</span>
                                    )}
                                  </span>
                                </div>
                                <div className="flex justify-between items-center text-xs">
                                  <span className="text-stone-400">Timp întors</span>
                                  <span className="flex items-center gap-1.5">
                                    <span className={clsx('font-mono font-semibold', hasGoogle ? 'text-emerald-300' : 'text-stone-200')}>
                                      {fmtMin(main.return_min)}
                                    </span>
                                    {trafficRetur !== null && trafficRetur > 0 && (
                                      <span className="text-amber-400 text-[10px]">+{fmtMin(trafficRetur)} trafic</span>
                                    )}
                                  </span>
                                </div>
                                {!hasGoogle && (
                                  <p className="text-[10px] text-stone-500">OSRM · fără trafic real</p>
                                )}
                              </>
                            ) : (
                              <p className="text-xs text-stone-500 italic">Rutare indisponibilă</p>
                            )}
                          </div>

                          {/* Stop list */}
                          <div className="divide-y divide-stone-800/60">
                            {trip.comenzi.map(stop => (
                              <div key={stop.id} className="px-4 py-2.5 flex items-start gap-3">
                                <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0 mt-0.5" style={{ background: DRIVER_COLORS[activeTab] }}>
                                  {stop.order}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-stone-200 truncate capitalize">{stop.name?.toLowerCase()}</p>
                                  <p className="text-[11px] text-stone-500 truncate">{stop.address}</p>
                                  {stop.status_label && <span className="text-[10px] text-stone-500">{stop.status_label}</span>}
                                </div>
                                <div className="shrink-0 flex gap-1">
                                  {localSoferi.map((_, di) => di !== activeTab && (
                                    <button
                                      key={di}
                                      onClick={() => moveStop(activeTab, stop.id, di)}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] bg-stone-800 hover:bg-stone-700 text-stone-400 hover:text-stone-200 transition-colors"
                                      title={`Mută la Șofer ${di + 1}`}
                                    >
                                      <ArrowRightLeft className="w-3 h-3" />
                                      <span className="w-2 h-2 rounded-full inline-block" style={{ background: DRIVER_COLORS[di] }} />
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>

                          {/* Maps link per trip */}
                          {trip.maps_url && (
                            <div className="px-4 py-2">
                              <a href={trip.maps_url} target="_blank" rel="noreferrer"
                                className="flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 transition-colors">
                                <ExternalLink className="w-3 h-3" /> Deschide în Google Maps
                              </a>
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Total if multiple trips */}
                    {activeDriver.curse.length > 1 && (() => {
                      const totalDus = activeDriver.curse.reduce((s, t) => s + (getTripMain(t)?.duration_min ?? 0), 0);
                      const totalRetur = activeDriver.curse.reduce((s, t) => s + (getTripMain(t)?.return_min ?? 0), 0);
                      return (
                        <div className="px-4 py-3 border-t-2 border-stone-700 bg-stone-800/40 space-y-1">
                          <p className="text-[11px] text-stone-400 font-semibold">TOTAL ȘOFER {activeTab + 1}</p>
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-400">Timp total dus</span>
                            <span className="text-stone-200 font-mono font-semibold">{fmtMin(totalDus)}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-stone-400">Timp total întors</span>
                            <span className="text-stone-200 font-mono font-semibold">{fmtMin(totalRetur)}</span>
                          </div>
                          <div className="flex justify-between text-xs border-t border-stone-700 pt-1 mt-1">
                            <span className="text-stone-300 font-medium">Grand total</span>
                            <span className="text-stone-100 font-mono font-bold">{fmtMin(totalDus + totalRetur)}</span>
                          </div>
                        </div>
                      );
                    })()}

                    {activeDriver.curse.length === 0 && (
                      <p className="px-4 py-6 text-sm text-stone-500 italic text-center">Nicio livrare</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Timing ───────────────────────────────────────────────────────────────────

const STAGES_LIVRARE  = [1, 4, 16, 32, 512];
const STAGES_RIDICARE = [1, 4, 16, 512];
const STATUS_LABELS: Record<number, string> = { 1: 'Nouă', 2: 'Așteptare', 4: 'Confirmată', 16: 'Pregătită', 32: 'În livrare', 256: 'Problemă', 512: 'Livrată' };
const STATUS_COLORS: Record<number, string> = { 1: 'blue', 2: 'orange', 4: 'amber', 16: 'amber', 32: 'blue', 256: 'red', 512: 'emerald' };

function fmtDur(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60), rem = m % 60;
  return rem > 0 ? `${h}h ${rem}m` : `${h}h`;
}

interface TimingOrder {
  erp_id: string;
  number: number;
  customer_name: string;
  address: string;
  is_ridicare: boolean;
  created_at: string | null;
  journal_dt: string | null;
  erp_time: string | null;
  erp_date: string | null;
  current_status: number | null;
  history: { status: number; erp_time: string | null; recorded_at: string | null }[];
}

// Returns milliseconds between two status transitions, or null
function getSegMs(hist: TimingOrder['history'], fromStatus: number, toStatus: number): number | null {
  const timeOf = (s: number): Date | null => {
    const h = hist.find(h => h.status === s);
    if (!h) return null;
    const ts = h.erp_time ?? h.recorded_at;
    return ts ? new Date(ts) : null;
  };
  const t0 = timeOf(fromStatus), t1 = timeOf(toStatus);
  return t0 && t1 ? t1.getTime() - t0.getTime() : null;
}


function avgMs(vals: (number | null)[]): number | null {
  const v = vals.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

// Mini inline progress bar for a row
const MiniProgress: React.FC<{ stages: number[]; currentStatus: number | null }> = ({ stages, currentStatus }) => {
  const idx = currentStatus !== null ? stages.indexOf(currentStatus) : -1;
  const pct = idx < 0 ? 0 : Math.round((idx / (stages.length - 1)) * 100);
  const done = currentStatus === stages[stages.length - 1];
  return (
    <div className="flex items-center gap-1.5 min-w-[60px]">
      <div className="flex-1 h-1.5 bg-stone-100 dark:bg-stone-700 rounded-full overflow-hidden">
        <div
          className={clsx('h-full rounded-full transition-all', done ? 'bg-emerald-500' : 'bg-blue-500')}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-mono text-stone-400 w-6 text-right">{pct}%</span>
    </div>
  );
};

const StatusPill: React.FC<{ status: number | null }> = ({ status }) => {
  if (status === null) return <span className="text-stone-300 dark:text-stone-600">—</span>;
  const label = STATUS_LABELS[status] ?? `${status}`;
  const color = STATUS_COLORS[status] ?? 'blue';
  return (
    <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold whitespace-nowrap',
      color === 'emerald' ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' :
      color === 'amber'   ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300' :
      color === 'red'     ? 'bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400' :
      color === 'orange'  ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300' :
                            'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
    )}>
      {label}
    </span>
  );
};

const TimingTab: React.FC = () => {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [typeFilter, setTypeFilter] = useState<'toate' | 'livrari' | 'ridicari'>('toate');
  const queryClient = useQueryClient();
  const isToday = date === today;

  const { data, isLoading, isFetching, refetch } = useQuery<{ orders: TimingOrder[]; date: string }>({
    queryKey: ['comenzi-timing', date],
    queryFn: () => api.getComenziTiming(date),
    refetchInterval: isToday ? 120_000 : false,
    staleTime: isToday ? 60_000 : 5 * 60_000,
  });

  const backfill = useMutation({
    mutationFn: () => api.backfillComenziTiming(),
    onSuccess: (res) => {
      toast.success(`Backfill: ${res.seeded} comenzi seeded`);
      queryClient.invalidateQueries({ queryKey: ['comenzi-timing'] });
    },
    onError: () => toast.error('Eroare backfill'),
  });

  const orders = data?.orders ?? [];
  const filtered = orders.filter(o =>
    typeFilter === 'toate' ? true :
    typeFilter === 'livrari' ? !o.is_ridicare && !!o.address : o.is_ridicare
  );
  // Always use STAGES_LIVRARE as column headers; ridicare rows show — for stages they skip
  const stages = STAGES_LIVRARE;
  const showTip = typeFilter === 'toate';

  // ── Computed durations per order ──────────────────────────────────────────
  type Row = {
    order: TimingOrder;
    segs: (number | null)[];   // duration ms per stage transition
    totalMs: number | null;
  };

  const rows: Row[] = filtered.map(o => {
    let totalMs: number | null = null;
    if (o.created_at && o.journal_dt) {
      const diff = new Date(o.journal_dt).getTime() - new Date(o.created_at).getTime();
      totalMs = Math.max(0, diff);
    }
    return {
      order: o,
      segs: stages.slice(0, -1).map((s, i) => getSegMs(o.history, s, stages[i + 1])),
      totalMs,
    };
  });

  // Sort: delivered last (or by number desc)
  rows.sort((a, b) => (b.order.number ?? 0) - (a.order.number ?? 0));

  // ── Metrics ───────────────────────────────────────────────────────────────
  const total      = filtered.length;
  const livrate    = filtered.filter(o => o.current_status === 512).length;
  const inProgress = filtered.filter(o => o.current_status !== null && o.current_status !== 512).length;
  const withTiming = rows.filter(r => r.totalMs !== null).length;

  const deliveredRows = rows.filter(r => r.order.current_status === 512 && r.totalMs !== null);
  const totalDurs = deliveredRows.map(r => r.totalMs!);
  const avgTotal = avgMs(totalDurs.map(d => d));
  const minTotal = totalDurs.length ? Math.min(...totalDurs) : null;
  const maxTotal = totalDurs.length ? Math.max(...totalDurs) : null;

  // Per-stage averages (only from delivered orders)
  const stageAvgs = stages.slice(0, -1).map((_, i) =>
    avgMs(deliveredRows.map(r => r.segs[i]))
  );

  // ── Stage column headers ───────────────────────────────────────────────────
  const stageHeaders = stages.slice(0, -1).map((s, i) =>
    `${STATUS_LABELS[s] ?? s} → ${STATUS_LABELS[stages[i + 1]] ?? stages[i + 1]}`
  );

  return (
    <div className="space-y-4">
      {/* Controls row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={date}
            max={today}
            onChange={e => setDate(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex rounded-lg border border-stone-200 dark:border-stone-700 overflow-hidden text-xs">
            {([
              { id: 'toate',    label: 'Toate' },
              { id: 'livrari',  label: 'Livrări' },
              { id: 'ridicari', label: 'Ridicări' },
            ] as const).map(t => (
              <button
                key={t.id}
                onClick={() => setTypeFilter(t.id)}
                className={clsx('px-3 py-1.5 font-medium transition-colors',
                  typeFilter === t.id
                    ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
                    : 'bg-white dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx('w-3 h-3', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => backfill.mutate()}
            disabled={backfill.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-stone-100 dark:bg-stone-800 text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
            title="Seeder pentru comenzi fără history"
          >
            {backfill.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <RotateCcw className="w-3 h-3" />}
            Backfill
          </button>
        </div>
      </div>

      {/* Metrics cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { label: 'Total',       value: total,                              cls: 'text-stone-800 dark:text-stone-100' },
          { label: 'Livrate',     value: livrate,                            cls: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'În progres',  value: inProgress,                         cls: 'text-blue-600 dark:text-blue-400' },
          { label: 'Cu timing',   value: withTiming,                         cls: 'text-stone-600 dark:text-stone-300' },
          { label: 'Avg total',   value: avgTotal !== null ? fmtDur(avgTotal) : '—', cls: 'text-stone-800 dark:text-stone-100' },
          { label: 'Min / Max',   value: minTotal !== null ? `${fmtDur(minTotal)} / ${fmtDur(maxTotal!)}` : '—', cls: 'text-stone-600 dark:text-stone-300' },
        ].map(m => (
          <div key={m.label} className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-3 py-2.5">
            <p className="text-[11px] text-stone-400 dark:text-stone-500 mb-0.5">{m.label}</p>
            <p className={clsx('text-lg font-bold leading-tight', m.cls)}>{m.value}</p>
          </div>
        ))}
      </div>

      {/* Per-stage averages */}
      {deliveredRows.length > 0 && (
        <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <p className="text-xs font-semibold text-stone-500 dark:text-stone-400 mb-2">
            Durată medie pe etapă ({deliveredRows.length} livrate cu timing complet)
          </p>
          <div className="flex flex-wrap gap-4">
            {stageHeaders.map((h, i) => (
              <div key={h} className="flex items-center gap-2">
                <span className="text-[11px] text-stone-400">{h}</span>
                <span className="text-sm font-bold text-stone-800 dark:text-stone-100">
                  {stageAvgs[i] !== null ? fmtDur(stageAvgs[i]!) : '—'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center justify-center py-16 text-stone-400">
          <Loader2 className="w-5 h-5 animate-spin mr-2" /> Se încarcă timing...
        </div>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="text-center py-12 text-stone-400 text-sm">
          Nicio comandă pentru {date}.
        </div>
      )}

      {/* Table */}
      {rows.length > 0 && (
        <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-700 text-[11px] text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                  <th className="text-left px-3 py-2 font-medium">Nr</th>
                  <th className="text-left px-3 py-2 font-medium">Creat</th>
                  <th className="text-left px-3 py-2 font-medium">Ultima modif.</th>
                  <th className="text-left px-3 py-2 font-medium">Client</th>
                  {showTip && <th className="text-left px-3 py-2 font-medium">Tip</th>}
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">Progres</th>
                  {stageHeaders.map(h => (
                    <th key={h} className="text-right px-3 py-2 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  <th className="text-right px-3 py-2 font-medium">Total</th>
                </tr>
                {/* Averages row */}
                {deliveredRows.length > 0 && (
                  <tr className="border-b border-stone-100 dark:border-stone-700 bg-stone-50 dark:bg-stone-700/30 text-[10px] text-stone-400">
                    <td colSpan={showTip ? 7 : 6} className="px-3 py-1 italic">avg livrate</td>
                    {stageAvgs.map((a, i) => (
                      <td key={i} className="px-3 py-1 text-right font-mono text-stone-500 dark:text-stone-400">
                        {a !== null ? fmtDur(a) : '—'}
                      </td>
                    ))}
                    <td className="px-3 py-1 text-right font-mono font-semibold text-stone-600 dark:text-stone-300">
                      {avgTotal !== null ? fmtDur(avgTotal) : '—'}
                    </td>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-700/40">
                {rows.map(({ order: o, segs, totalMs: tms }) => {
                  const cs = o.current_status;
                  const isLivrata = cs === 512;
                  const orderStages = o.is_ridicare ? STAGES_RIDICARE : STAGES_LIVRARE;
                  return (
                    <tr
                      key={o.erp_id}
                      className={clsx(
                        'hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors',
                        isLivrata && 'opacity-60'
                      )}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs font-semibold text-stone-600 dark:text-stone-300">#{o.number}</span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="font-mono text-xs text-stone-700 dark:text-stone-200">
                          {o.created_at ? o.created_at.slice(11, 16) : '—'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {o.journal_dt ? (
                          <span className="font-mono text-xs text-amber-600 dark:text-amber-400">
                            {o.journal_dt.slice(11, 16)}
                          </span>
                        ) : (
                          <span className="text-stone-300 dark:text-stone-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2 max-w-[160px]">
                        <p className="text-xs font-medium text-stone-800 dark:text-stone-100 truncate capitalize">
                          {o.customer_name?.toLowerCase()}
                        </p>
                        <p className="text-[10px] text-stone-400 truncate">{o.address}</p>
                      </td>
                      {showTip && (
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={clsx('inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold',
                            o.is_ridicare
                              ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300'
                              : 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          )}>
                            {o.is_ridicare ? 'R' : 'L'}
                          </span>
                        </td>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap">
                        <StatusPill status={cs} />
                      </td>
                      <td className="px-3 py-2">
                        <MiniProgress stages={orderStages} currentStatus={cs} />
                      </td>
                      {segs.map((ms, i) => (
                        <td key={i} className="px-3 py-2 text-right whitespace-nowrap">
                          {ms !== null ? (
                            <span className={clsx('font-mono text-xs', ms > (stageAvgs[i] ?? Infinity) * 1.5 ? 'text-red-500 font-semibold' : 'text-stone-600 dark:text-stone-300')}>
                              {fmtDur(ms)}
                            </span>
                          ) : (
                            <span className="text-stone-200 dark:text-stone-700">—</span>
                          )}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        {tms !== null ? (
                          <span className={clsx('font-mono text-xs font-semibold',
                            isLivrata ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-500')}>
                            {fmtDur(tms)}
                          </span>
                        ) : (
                          <span className="text-stone-200 dark:text-stone-700">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export const ComenziAziPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [mainTab, setMainTab] = useState<'comenzi' | 'timing'>('comenzi');
  const [copied, setCopied] = useState<string | null>(null);
  const [markModal, setMarkModal] = useState<Comanda | null>(null);
  const [showRute, setShowRute] = useState(false);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<{ comenzi: Comanda[]; total: number }>({
    queryKey: ['comenzi-azi'],
    queryFn: () => api.getComenziorAzi(),
    staleTime: 2 * 60 * 1000,
    refetchInterval: 120_000,
  });

  const livrari = (data?.comenzi ?? []).filter(c => !c.is_ridicare);
  const ridicari = (data?.comenzi ?? []).filter(c => c.is_ridicare);

  // Sync OrderProjection azi
  const syncOrders = useMutation({
    mutationFn: () => api.syncOrdersToday(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['comenzi-azi'] });
      queryClient.invalidateQueries({ queryKey: ['comenzi-timing'] });
      toast.success(`Sync OK · ${res.inserted} noi · ${res.updated} actualizate`);
    },
    onError: () => toast.error('Eroare la sync comenzi'),
  });

  // Mark ALL on map
  const marcheazaTot = useMutation({
    mutationFn: () => api.marcheazaHartaTot(),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['map-pins'] });
      toast.success(`${res.added} pini adăugați pe hartă${res.failed?.length ? ` · ${res.failed.length} adrese negăsite` : ''}`);
    },
    onError: () => toast.error('Eroare la marcare hartă'),
  });

  // Mark single
  const marcheazaUnul = useMutation({
    mutationFn: ({ comanda, address }: { comanda: Comanda; address: string }) =>
      api.marcheazaPin({ address, customer_name: comanda.customer_name, color: comanda.status_color, note: comanda.status_label }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['map-pins'] });
      toast.success('Pin adăugat pe hartă');
      setMarkModal(null);
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.detail ?? 'Adresă negăsită');
    },
  });

  const handleCopy = (phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopied(phone);
    setTimeout(() => setCopied(null), 2000);
  };

  // ── Stats ──────────────────────────────────────────────────────────────────
  const livrate    = livrari.filter(c => c.status === 512).length;
  const probleme   = livrari.filter(c => c.status === 256).length;
  const totalVal   = livrari.reduce((s, c) => s + (c.total ?? 0), 0);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Truck className="w-5 h-5 text-stone-400" />
          <h1 className="text-xl font-bold text-stone-900 dark:text-stone-50">Comenzi Azi</h1>
          {data && (
            <span className="text-sm text-stone-400">
              — {livrari.length} livrări · {ridicari.length} ridicări
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', isFetching && 'animate-spin')} />
            Refresh
          </button>
          <button
            onClick={() => syncOrders.mutate()}
            disabled={syncOrders.isPending}
            title="Sync Comenzi (OrderProjection)"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
          >
            {syncOrders.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <RotateCcw className="w-3.5 h-3.5" />}
            Sync Comenzi
          </button>
          <button
            onClick={() => setShowRute(true)}
            disabled={livrari.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 transition-colors"
          >
            <Route className="w-3.5 h-3.5" />
            Calculează Rute
          </button>
          <button
            onClick={() => marcheazaTot.mutate()}
            disabled={marcheazaTot.isPending || livrari.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
            title={`Geocodează și marchează pe hartă toate ${livrari.length} livrările (~${livrari.length}s)`}
          >
            {marcheazaTot.isPending
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <Map className="w-3.5 h-3.5" />}
            {marcheazaTot.isPending ? 'Se geocodează...' : `Marchează toate pe hartă (${livrari.length})`}
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-stone-200 dark:border-stone-700">
        {([
          { id: 'comenzi' as const, label: 'Comenzi' },
          { id: 'timing'  as const, label: 'Timing ⏱' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            onClick={() => setMainTab(tab.id)}
            className={clsx(
              'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
              mainTab === tab.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-200'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Timing tab */}
      {mainTab === 'timing' && <TimingTab />}

      {/* Stats */}
      {mainTab === 'comenzi' && data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Livrări azi',  value: livrari.length,              icon: Truck,        cls: 'text-blue-600' },
            { label: 'Livrate',      value: livrate,                      icon: Package,      cls: 'text-emerald-600' },
            { label: 'Probleme',     value: probleme,                     icon: AlertCircle,  cls: 'text-red-500' },
            { label: 'Total valoare',value: `${totalVal.toFixed(2)} lei`, icon: null,         cls: 'text-stone-700 dark:text-stone-200' },
          ].map(s => (
            <div key={s.label} className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
              <p className="text-xs text-stone-400 dark:text-stone-500 mb-1">{s.label}</p>
              <p className={clsx('text-2xl font-bold', s.cls)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Loading / Error */}
      {mainTab === 'comenzi' && isLoading && (
        <div className="flex items-center justify-center py-16 text-stone-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2" /> Se încarcă comenzile...
        </div>
      )}
      {mainTab === 'comenzi' && isError && (
        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 rounded-xl p-4 text-sm text-red-700 dark:text-red-400">
          {(error as any)?.response?.data?.detail ?? 'Eroare la încărcarea comenzilor'}
        </div>
      )}

      {/* Delivery orders table */}
      {mainTab === 'comenzi' && livrari.length > 0 && (
        <div className="bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 dark:border-stone-700 flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-sm text-stone-800 dark:text-stone-100">Livrări</span>
            <span className="ml-auto text-xs text-stone-400">{livrari.length} comenzi</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-100 dark:border-stone-700 text-xs text-stone-400 dark:text-stone-500 uppercase tracking-wider">
                  <th className="text-left px-4 py-2 font-medium">Ora · Nr</th>
                  <th className="text-left px-4 py-2 font-medium">Client</th>
                  <th className="text-left px-4 py-2 font-medium">Adresă</th>
                  <th className="text-left px-4 py-2 font-medium">ETA</th>
                  <th className="text-left px-4 py-2 font-medium">Telefon</th>
                  <th className="text-right px-4 py-2 font-medium">Total</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50 dark:divide-stone-700/50">
                {livrari.map(c => (
                  <tr key={c.id} className="hover:bg-stone-50 dark:hover:bg-stone-700/30 transition-colors">
                    {/* Ora · Nr */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <p className="font-mono text-xs font-semibold text-stone-700 dark:text-stone-200">{c.created_at ? c.created_at.slice(11, 16) : c.time}</p>
                      <p className="text-[11px] text-stone-400">#{c.number}</p>
                    </td>
                    {/* Client */}
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-stone-800 dark:text-stone-100 capitalize">
                        {c.customer_name?.toLowerCase()}
                      </p>
                    </td>
                    {/* Adresă */}
                    <td className="px-4 py-2.5 max-w-[200px]">
                      <p className="text-stone-500 dark:text-stone-400 text-xs truncate capitalize">
                        {c.address?.toLowerCase().replace(/\*\*\*/g, '').trim()}
                      </p>
                    </td>
                    {/* ETA */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {c.eta_delivery ? (
                        <div>
                          <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-tight">La client</p>
                          <p className="font-mono text-xs font-bold text-emerald-600 dark:text-emerald-400">{c.eta_delivery}</p>
                          {c.eta_return && (
                            <>
                              <p className="text-[10px] text-stone-400 dark:text-stone-500 leading-tight mt-1">Întoarcere</p>
                              <p className="font-mono text-xs text-stone-500 dark:text-stone-400">{c.eta_return}</p>
                            </>
                          )}
                        </div>
                      ) : (
                        <span className="text-[10px] text-stone-300 dark:text-stone-600">—</span>
                      )}
                    </td>
                    {/* Telefon */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {c.phone ? (
                        <button
                          onClick={() => handleCopy(c.phone)}
                          className="flex items-center gap-1 font-mono text-xs text-stone-600 dark:text-stone-300 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                        >
                          {c.phone}
                          {copied === c.phone
                            ? <Check className="w-3 h-3 text-emerald-500" />
                            : <Copy className="w-3 h-3 opacity-40" />}
                        </button>
                      ) : <span className="text-stone-300">—</span>}
                    </td>
                    {/* Total */}
                    <td className="px-4 py-2.5 text-right whitespace-nowrap">
                      <span className="font-semibold text-stone-800 dark:text-stone-100">
                        {c.total?.toFixed(2)}
                      </span>
                      <span className="text-xs text-stone-400 ml-0.5">lei</span>
                    </td>
                    {/* Status */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <StatusBadge label={c.status_label} color={c.status_color} />
                    </td>
                    {/* Acțiuni */}
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      <button
                        onClick={() => setMarkModal(c)}
                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-blue-100 dark:hover:bg-blue-900/30 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                        title="Marchează pe hartă"
                      >
                        <MapPin className="w-3 h-3" />
                        Hartă
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pickup orders — collapsed summary */}
      {mainTab === 'comenzi' && ridicari.length > 0 && (
        <div className="bg-stone-50 dark:bg-stone-800/50 rounded-xl border border-stone-200 dark:border-stone-700 px-4 py-3">
          <div className="flex items-center gap-2 text-stone-400 dark:text-stone-500">
            <Package className="w-4 h-4" />
            <span className="text-sm">{ridicari.length} comenzi RIDICARE</span>
            <span className="text-xs ml-auto">
              {ridicari.reduce((s, c) => s + (c.total ?? 0), 0).toFixed(2)} lei
            </span>
          </div>
        </div>
      )}

      {/* Mark pin modal */}
      {markModal && (
        <MarkModal
          comanda={markModal}
          isPending={marcheazaUnul.isPending}
          onConfirm={(address) => marcheazaUnul.mutate({ comanda: markModal, address })}
          onClose={() => { setMarkModal(null); marcheazaUnul.reset(); }}
        />
      )}

      {/* Rute modal */}
      {showRute && (
        <RuteModal comenzi={livrari} onClose={() => setShowRute(false)} />
      )}
    </div>
  );
};
