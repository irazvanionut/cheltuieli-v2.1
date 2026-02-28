import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Layers, RefreshCw, Navigation, AlertCircle, Settings, Package, Maximize2 } from 'lucide-react';
import { clsx } from 'clsx';
import api from '@/services/api';
import { useAppStore } from '@/hooks/useAppStore';
import type { MapPin } from '@/types';

const RESTAURANT_LAT = 44.5064935;
const RESTAURANT_LNG = 26.2184075;
const POLL_INTERVAL_MS = 15_000;
const ORDER_POLL_MS = 2 * 60 * 1000;

const PIN_COLORS: Record<string, string> = {
  blue:   '#2563eb',
  red:    '#dc2626',
  green:  '#16a34a',
  orange: '#ea580c',
  purple: '#9333ea',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function loadGoogleMapsScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).google?.maps) { resolve(); return; }
    const existing = document.getElementById('gmaps-script');
    if (existing) { existing.addEventListener('load', () => resolve()); return; }
    const script = document.createElement('script');
    script.id = 'gmaps-script';
    script.src = src;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Google Maps JS failed to load'));
    document.head.appendChild(script);
  });
}

function makeCarSvg(color: string, course: number) {
  const arrow = `rotate(${course}, 16, 16)`;
  return encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
      <circle cx="16" cy="16" r="14" fill="${color}" stroke="white" stroke-width="2"/>
      <polygon points="16,6 20,22 16,18 12,22" fill="white" opacity="0.9" transform="${arrow}"/>
    </svg>`
  );
}

function makeDeliveryPinSvg(color: string, name: string, time: string): { dataUrl: string; w: number; h: number } {
  const MAX_NAME = 14;
  const displayName = name.length > MAX_NAME ? name.slice(0, MAX_NAME - 1) + '\u2026' : name;
  const hasTime = time.length > 0;
  const boxH = hasTime ? 30 : 18;
  const h = boxH + 16;
  const maxLen = hasTime ? Math.max(displayName.length, time.length) : displayName.length;
  const w = Math.max(72, maxLen * 7 + 18);
  const cx = w / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="1" y="1" width="${w - 2}" height="${boxH}" rx="4" fill="${color}" stroke="white" stroke-width="1.5"/>
    <polygon points="${cx - 5},${boxH + 1} ${cx + 5},${boxH + 1} ${cx},${h - 2}" fill="${color}" stroke="white" stroke-width="1"/>
    <text x="${cx}" y="${hasTime ? 13 : 12}" text-anchor="middle" font-size="10" font-family="Arial,sans-serif" fill="white" font-weight="700">${displayName}</text>
    ${hasTime ? `<text x="${cx}" y="26" text-anchor="middle" font-size="9" font-family="Arial,sans-serif" fill="rgba(255,255,255,0.9)">${time}</text>` : ''}
  </svg>`;
  return { dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, w, h };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export const NavigatieGpsPage: React.FC = () => {
  const { isAuthenticated } = useAppStore();
  const isPublic = !isAuthenticated;

  const mapDivRef = useRef<HTMLDivElement>(null);
  const gMapRef = useRef<any>(null);
  const trafficLayerRef = useRef<any>(null);
  const markersRef = useRef<Map<number, any>>(new Map());
  const deliveryMarkersRef = useRef<Map<number, any>>(new Map());
  const infoWindowRef = useRef<any>(null);

  const [mapReady, setMapReady] = useState(false);
  const [trafficOn, setTrafficOn] = useState(true);
  const [vehicles, setVehicles] = useState<any[]>([]);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [polling, setPolling] = useState(false);
  const [traccarError, setTraccarError] = useState<string | null>(null);

  // Public mode: only boolean flag (key stays on server, loaded via /public/gps/maps-js proxy)
  const { data: publicSettings } = useQuery<{ has_maps_key: boolean }>({
    queryKey: ['public-gps-settings'],
    queryFn: () => api.getPublicGpsSettings(),
    staleTime: 5 * 60 * 1000,
    enabled: isPublic,
  });
  // Auth mode: full settings (key used to construct Maps JS URL directly)
  const { data: authSettings = [] } = useQuery<any[]>({
    queryKey: ['settings'],
    queryFn: () => api.getSettings(),
    staleTime: 5 * 60 * 1000,
    enabled: !isPublic,
  });

  const googleDisabledAuth = (authSettings as any[]).find((s: any) => s.cheie === 'google_maps_disabled')?.valoare === 'true';

  const hasMapsKey = isPublic
    ? (publicSettings?.has_maps_key ?? false)
    : Boolean((authSettings as any[]).find((s: any) => s.cheie === 'google_maps_api_key')?.valoare) && !googleDisabledAuth;

  // In public mode Maps JS loads via backend proxy → key never sent to browser
  const mapsJsSrc = isPublic
    ? (hasMapsKey ? api.getPublicMapsJsUrl() : '')
    : (() => {
        if (googleDisabledAuth) return '';
        const key = (authSettings as any[]).find((s: any) => s.cheie === 'google_maps_api_key')?.valoare || '';
        return key ? `https://maps.googleapis.com/maps/api/js?key=${key}&v=weekly` : '';
      })();

  // Fetch map pins (delivery + permanent)
  const { data: mapPins = [] } = useQuery<MapPin[]>({
    queryKey: isPublic ? ['public-gps-pins'] : ['map-pins'],
    queryFn: () => isPublic ? api.getPublicGpsPins() : api.getMapPins(),
    refetchInterval: ORDER_POLL_MS,
  });

  // Fetch today's orders
  const { data: comenziData } = useQuery<{ comenzi: any[]; total: number }>({
    queryKey: isPublic ? ['public-gps-comenzi'] : ['comenzi-azi'],
    queryFn: () => isPublic ? api.getPublicGpsComenzii() : api.getComenziorAzi(),
    refetchInterval: ORDER_POLL_MS,
  });

  // Sync orders to map pins on mount
  useEffect(() => {
    if (isPublic) {
      api.syncPublicGpsHarta().catch(() => {});
    } else {
      api.syncComenziHarta().catch(() => {});
    }
  }, [isPublic]);

  // Build lookup: customer_name.toLowerCase() → order
  const orderByName = useMemo(() => {
    const map = new Map<string, any>();
    (comenziData?.comenzi || []).forEach((c: any) => {
      if (c.customer_name) map.set(c.customer_name.toLowerCase(), c);
    });
    return map;
  }, [comenziData]);

  // Delivery pins (non-permanent) — shared between effects
  const deliveryPins = useMemo(
    () => (mapPins as MapPin[]).filter(p => !p.permanent),
    [mapPins]
  );

  // ── Load Google Maps JS and init map ────────────────────────────────────────
  useEffect(() => {
    if (!mapsJsSrc || !mapDivRef.current) return;

    loadGoogleMapsScript(mapsJsSrc).then(() => {
      if (!mapDivRef.current || gMapRef.current) return;
      const g = (window as any).google;

      const map = new g.maps.Map(mapDivRef.current, {
        center: { lat: RESTAURANT_LAT, lng: RESTAURANT_LNG },
        zoom: 13,
        mapTypeId: 'roadmap',
        fullscreenControl: false,
        streetViewControl: false,
        mapTypeControl: true,
      });
      gMapRef.current = map;

      // Restaurant marker (label pin style)
      const { dataUrl: restUrl, w: restW, h: restH } = makeDeliveryPinSvg('#16a34a', 'Restaurant', '');
      new g.maps.Marker({
        position: { lat: RESTAURANT_LAT, lng: RESTAURANT_LNG },
        map,
        title: 'Restaurant',
        zIndex: 100,
        icon: {
          url: restUrl,
          scaledSize: new g.maps.Size(restW, restH),
          anchor: new g.maps.Point(restW / 2, restH),
        },
      });

      // Traffic layer
      const traffic = new g.maps.TrafficLayer();
      trafficLayerRef.current = traffic;
      if (trafficOn) traffic.setMap(map);

      // Info window (shared)
      infoWindowRef.current = new g.maps.InfoWindow();

      setMapReady(true);
      if (isPublic) {
        api.incrementPublicMapsJsCounter();
      } else {
        api.incrementMapsJsCounter();
      }
    }).catch(() => {
      // will show error via hasMapsKey check
    });
  }, [mapsJsSrc]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Toggle traffic ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!trafficLayerRef.current || !gMapRef.current) return;
    trafficLayerRef.current.setMap(trafficOn ? gMapRef.current : null);
  }, [trafficOn]);

  // ── Fetch Traccar positions ─────────────────────────────────────────────────
  const fetchVehicles = useCallback(async (showSpinner = false) => {
    if (showSpinner) setPolling(true);
    try {
      const data = isPublic ? await api.getPublicGpsPozitii() : await api.getTraccarPozitii();
      if (data.error) {
        setTraccarError(data.error);
      } else {
        setTraccarError(null);
        setVehicles(data.vehicles || []);
        setLastUpdate(new Date());
      }
    } catch (e: any) {
      setTraccarError(e?.message || 'Eroare Traccar');
    } finally {
      if (showSpinner) setPolling(false);
    }
  }, [isPublic]);

  useEffect(() => {
    fetchVehicles();
    const interval = setInterval(fetchVehicles, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchVehicles]);

  // ── Update vehicle markers ──────────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !gMapRef.current) return;
    const g = (window as any).google;
    const map = gMapRef.current;

    const currentIds = new Set(vehicles.map((v: any) => v.id));

    // Remove stale markers
    markersRef.current.forEach((marker, id) => {
      if (!currentIds.has(id)) { marker.setMap(null); markersRef.current.delete(id); }
    });

    // Add/update markers
    vehicles.forEach((v: any) => {
      if (v.lat == null || v.lng == null) return;
      const pos = { lat: v.lat, lng: v.lng };
      const color = v.status === 'online' ? '#2563eb' : '#9ca3af';
      const iconUrl = `data:image/svg+xml,${makeCarSvg(color, v.course || 0)}`;

      const existing = markersRef.current.get(v.id);
      if (existing) {
        existing.setPosition(pos);
        existing.setIcon({ url: iconUrl, scaledSize: new g.maps.Size(32, 32), anchor: new g.maps.Point(16, 16) });
      } else {
        const marker = new g.maps.Marker({
          position: pos,
          map,
          title: v.name,
          icon: { url: iconUrl, scaledSize: new g.maps.Size(32, 32), anchor: new g.maps.Point(16, 16) },
          label: { text: v.name, color: '#1e293b', fontSize: '11px', fontWeight: 'bold' },
        });

        marker.addListener('click', () => {
          const fixTime = v.fixTime ? new Date(v.fixTime).toLocaleTimeString('ro-RO') : '—';
          infoWindowRef.current?.setContent(
            `<div style="font-family:sans-serif;min-width:160px">
              <p style="font-weight:700;margin:0 0 4px">${v.name}</p>
              <p style="margin:2px 0;font-size:12px">Viteza: <b>${v.speed} km/h</b></p>
              <p style="margin:2px 0;font-size:12px">Status: <b style="color:${color}">${v.status}</b></p>
              <p style="margin:2px 0;font-size:11px;color:#6b7280">Fix: ${fixTime}</p>
              <p style="margin:2px 0;font-size:11px;color:#6b7280">${v.lat?.toFixed(5)}, ${v.lng?.toFixed(5)}</p>
            </div>`
          );
          infoWindowRef.current?.open(map, marker);
        });

        markersRef.current.set(v.id, marker);
      }
    });
  }, [vehicles, mapReady]);

  // ── Update delivery pin markers ─────────────────────────────────────────────
  useEffect(() => {
    if (!mapReady || !gMapRef.current) return;
    const g = (window as any).google;
    const map = gMapRef.current;

    // Remove all existing delivery markers and recreate (avoids stale closures)
    deliveryMarkersRef.current.forEach(marker => marker.setMap(null));
    deliveryMarkersRef.current.clear();

    deliveryPins.forEach(pin => {
      const order = orderByName.get(pin.name.toLowerCase());
      const eta = order?.eta_delivery || '';
      const etaReturn = order?.eta_return || '';
      const travelMin = order?.travel_time_min;
      const colorHex = PIN_COLORS[pin.color] ?? PIN_COLORS.blue;
      const { dataUrl, w, h } = makeDeliveryPinSvg(colorHex, pin.name, eta ? `ETA ${eta}` : (order?.time || ''));

      const marker = new g.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        title: pin.name,
        icon: { url: dataUrl, scaledSize: new g.maps.Size(w, h), anchor: new g.maps.Point(w / 2, h) },
      });

      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(
          `<div style="font-family:sans-serif;min-width:160px;max-width:220px">
            <p style="font-weight:700;margin:0 0 6px;font-size:13px">${pin.name}</p>
            ${eta ? `<p style="margin:2px 0;font-size:12px">ETA livrare: <b style="color:#059669">${eta}</b>${etaReturn ? ` <span style="color:#9ca3af;font-size:11px">(↩ ${etaReturn})</span>` : ''}</p>` : ''}
            ${travelMin != null ? `<p style="margin:2px 0;font-size:11px;color:#9ca3af">${travelMin} min drum + 20 min prep</p>` : ''}
            ${order?.status_label ? `<p style="margin:2px 0;font-size:12px">Status: <b>${order.status_label}</b></p>` : ''}
            ${pin.address ? `<p style="margin:2px 0;font-size:11px;color:#6b7280">${pin.address}</p>` : ''}
          </div>`
        );
        infoWindowRef.current?.open(map, marker);
      });

      deliveryMarkersRef.current.set(pin.id, marker);
    });
  }, [deliveryPins, mapReady, orderByName]);

  // ── Auto-fit bounds: restaurant + toate livrările ────────────────────────────
  const fitBounds = useCallback(() => {
    if (!gMapRef.current) return;
    const g = (window as any).google;
    const map = gMapRef.current;
    if (deliveryPins.length > 0) {
      const bounds = new g.maps.LatLngBounds();
      bounds.extend({ lat: RESTAURANT_LAT, lng: RESTAURANT_LNG });
      deliveryPins.forEach(pin => bounds.extend({ lat: pin.lat, lng: pin.lng }));
      map.fitBounds(bounds, { top: 70, right: 50, bottom: 50, left: 50 });
    } else {
      map.setCenter({ lat: RESTAURANT_LAT, lng: RESTAURANT_LNG });
      map.setZoom(13);
    }
  }, [deliveryPins]);

  useEffect(() => {
    if (!mapReady) return;
    // requestAnimationFrame ensures the map container is fully laid out before fitting
    const raf = requestAnimationFrame(fitBounds);
    return () => cancelAnimationFrame(raf);
  }, [deliveryPins, mapReady, fitBounds]);

  // ─── Render ─────────────────────────────────────────────────────────────────

  const onlineCount = vehicles.filter((v: any) => v.status === 'online').length;
  const deliveryPinsCount = deliveryPins.length;

  return (
    <div className={isPublic
      ? 'h-screen overflow-hidden flex flex-col'
      : '-m-4 lg:-m-6 h-[calc(100vh-56px)] lg:h-screen overflow-hidden flex flex-col'
    }>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-stone-900 border-b border-stone-200 dark:border-stone-700 shrink-0 z-[1000] flex-wrap">
        <Navigation className="w-4 h-4 text-blue-500 shrink-0" />
        <span className="text-sm font-semibold text-stone-700 dark:text-stone-200">Navigatie GPS</span>

        {/* Traffic toggle */}
        <button
          onClick={() => setTrafficOn(v => !v)}
          disabled={!mapReady}
          className={clsx(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-40',
            trafficOn
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
          )}
        >
          <Layers className="w-3.5 h-3.5" />
          Trafic {trafficOn ? 'ON' : 'OFF'}
        </button>

        {/* Delivery pins count */}
        {deliveryPinsCount > 0 && (
          <span className="flex items-center gap-1 text-xs text-stone-500 dark:text-stone-400">
            <Package className="w-3.5 h-3.5 text-orange-400" />
            {deliveryPinsCount} livrari
          </span>
        )}

        {/* Traccar status */}
        {traccarError ? (
          <span className="flex items-center gap-1 text-xs text-red-500">
            <AlertCircle className="w-3.5 h-3.5" /> {traccarError}
          </span>
        ) : vehicles.length > 0 ? (
          <span className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
              {onlineCount}/{vehicles.length} vehicule
            </span>
            {lastUpdate && (
              <span>· {lastUpdate.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
            )}
          </span>
        ) : null}

        {/* Fit all orders */}
        <button
          onClick={fitBounds}
          disabled={!mapReady}
          title="Fit toate comenzile"
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-40 transition-colors"
        >
          <Maximize2 className="w-3 h-3" />
        </button>

        {/* Manual refresh Traccar */}
        <button
          onClick={() => fetchVehicles(true)}
          disabled={polling}
          className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-xs bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={clsx('w-3 h-3', polling && 'animate-spin')} />
        </button>

        {/* Vehicles list */}
        {vehicles.length > 0 && (
          <div className="ml-2 flex gap-1.5 flex-wrap">
            {vehicles.map((v: any) => (
              <span key={v.id} className={clsx(
                'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium',
                v.status === 'online'
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'bg-stone-100 dark:bg-stone-800 text-stone-400'
              )}>
                <span className={clsx('w-1.5 h-1.5 rounded-full', v.status === 'online' ? 'bg-blue-500' : 'bg-stone-400')} />
                {v.name}
                {v.speed > 0 && <span className="opacity-70">{v.speed}km/h</span>}
              </span>
            ))}
          </div>
        )}

        {/* Settings link hint — only shown to authenticated users */}
        {!hasMapsKey && !isPublic && (
          <span className="ml-auto flex items-center gap-1 text-xs text-amber-500">
            <Settings className="w-3.5 h-3.5" />
            Configurează Google Maps API key în Settings → Keys
          </span>
        )}
      </div>

      {/* Map */}
      <div className="flex-1 relative">
        <div ref={mapDivRef} style={{ height: '100%', width: '100%' }} />

        {/* No API key overlay */}
        {!hasMapsKey && (
          <div className="absolute inset-0 flex items-center justify-center bg-stone-100 dark:bg-stone-900">
            <div className="text-center space-y-3 p-8">
              <Navigation className="w-12 h-12 text-stone-300 mx-auto" />
              <p className="text-stone-500 font-medium">Google Maps API key neconfigurata</p>
              {!isPublic && (
                <>
                  <p className="text-stone-400 text-sm">
                    Mergi la <strong>Settings → Keys → Google Maps Geocoding</strong> si adauga cheia.
                  </p>
                  <p className="text-stone-400 text-xs">
                    Asigura-te ca ai activat <strong>Maps JavaScript API</strong> in Google Cloud Console.
                  </p>
                </>
              )}
            </div>
          </div>
        )}

        {/* Traccar not configured */}
        {hasMapsKey && mapReady && vehicles.length === 0 && !traccarError && (
          <div className="absolute bottom-4 left-4 bg-white/90 dark:bg-stone-800/90 rounded-lg px-3 py-2 text-xs text-stone-500 shadow-md">
            Niciun vehicul Traccar. Configureaza in <strong>Settings → Keys</strong>.
          </div>
        )}
      </div>
    </div>
  );
};
