import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Layers, RefreshCw, Navigation, AlertCircle, Settings, Package, Maximize2, MapPinOff, ChevronDown, ChevronUp, Check, X, Search } from 'lucide-react';
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

function makeDeliveryPinSvg(color: string, name: string, line2: string): { dataUrl: string; w: number; h: number } {
  const MAX_NAME = 14;
  const displayName = name.length > MAX_NAME ? name.slice(0, MAX_NAME - 1) + '\u2026' : name;
  const hasLine2 = line2.length > 0;
  const boxH = hasLine2 ? 30 : 18;
  const h = boxH + 16;
  const maxLen = hasLine2 ? Math.max(displayName.length, line2.length) : displayName.length;
  const w = Math.max(72, maxLen * 7 + 18);
  const cx = w / 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect x="1" y="1" width="${w - 2}" height="${boxH}" rx="4" fill="${color}" stroke="white" stroke-width="1.5"/>
    <polygon points="${cx - 5},${boxH + 1} ${cx + 5},${boxH + 1} ${cx},${h - 2}" fill="${color}" stroke="white" stroke-width="1"/>
    <text x="${cx}" y="${hasLine2 ? 13 : 12}" text-anchor="middle" font-size="10" font-family="Arial,sans-serif" fill="white" font-weight="700">${displayName}</text>
    ${hasLine2 ? `<text x="${cx}" y="26" text-anchor="middle" font-size="9" font-family="Arial,sans-serif" fill="rgba(255,255,255,0.9)">${line2}</text>` : ''}
  </svg>`;
  return { dataUrl: `data:image/svg+xml,${encodeURIComponent(svg)}`, w, h };
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export const NavigatieGpsPage: React.FC = () => {
  const { isAuthenticated } = useAppStore();
  const isPublic = !isAuthenticated;
  const queryClient = useQueryClient();

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

  // Search
  const [searchQ, setSearchQ] = useState('');
  const [searchResults, setSearchResults] = useState<{ lat: string; lon: string; display_name: string }[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const searchMarkerRef = useRef<any>(null);

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


  // Fetch map pins (delivery + permanent) — no auto-sync, pins set manually via Comenzi Azi
  const { data: mapPins = [] } = useQuery<MapPin[]>({
    queryKey: isPublic ? ['public-gps-pins'] : ['map-pins'],
    queryFn: () => isPublic ? api.getPublicGpsPins() : api.getMapPins(),
    refetchInterval: ORDER_POLL_MS,
  });

  // Fetch today's orders for ETA + created_at on pins
  const { data: comenziData } = useQuery<{ comenzi: any[]; total: number }>({
    queryKey: isPublic ? ['public-gps-comenzi'] : ['comenzi-azi'],
    queryFn: () => isPublic ? api.getPublicGpsComenzii() : api.getComenziorAzi(),
    refetchInterval: ORDER_POLL_MS,
  });

  // customer_name.toLowerCase() → all orders with that name (can be >1 for same-name clients)
  const ordersByName = useMemo(() => {
    const map = new Map<string, any[]>();
    (comenziData?.comenzi || []).forEach((c: any) => {
      if (c.customer_name) {
        const key = c.customer_name.toLowerCase();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(c);
      }
    });
    return map;
  }, [comenziData]);

  // Find the order that best matches a pin (by address word overlap when name is shared)
  const findOrder = useCallback((pin: MapPin) => {
    const candidates = ordersByName.get(pin.name.toLowerCase()) ?? [];
    if (candidates.length === 0) return null;
    if (candidates.length === 1) return candidates[0];
    const pinWords = new Set((pin.address || '').toLowerCase().split(/[\s,;]+/).filter(Boolean));
    return candidates.reduce((best: any, c: any) => {
      const cWords = new Set((c.address || '').toLowerCase().split(/[\s,;]+/).filter(Boolean));
      const score = [...pinWords].filter(w => cWords.has(w)).length;
      const bestWords = new Set((best?.address || '').toLowerCase().split(/[\s,;]+/).filter(Boolean));
      const bestScore = [...pinWords].filter(w => bestWords.has(w)).length;
      return score > bestScore ? c : best;
    }, candidates[0]);
  }, [ordersByName]);

  const deliveryPins = useMemo(
    () => (mapPins as MapPin[]).filter(p => !p.permanent),
    [mapPins]
  );

  // Orders without coordinates — geocoding failed or not yet synced
  const ungeocodedOrders = useMemo(
    () => (comenziData?.comenzi || []).filter((c: any) => !c.is_ridicare && c.lat == null),
    [comenziData]
  );

  const [ungeoExpanded, setUngeoExpanded] = useState(true);

  // Fix locație — pin existent geocodat greșit
  const [fixingPin, setFixingPin] = useState<{ id: number; name: string; address: string } | null>(null);
  const [fixAddress, setFixAddress] = useState('');
  const [fixing, setFixing] = useState(false);
  const [fixError, setFixError] = useState<string | null>(null);

  const handleFixPin = useCallback(async () => {
    if (!fixingPin || !fixAddress.trim()) return;
    setFixing(true);
    setFixError(null);
    try {
      await api.updateMapPinAddress(fixingPin.id, fixAddress.trim());
      queryClient.invalidateQueries({ queryKey: isPublic ? ['public-gps-pins'] : ['map-pins'] });
      queryClient.invalidateQueries({ queryKey: isPublic ? ['public-gps-comenzi'] : ['comenzi-azi'] });
      setFixingPin(null);
      infoWindowRef.current?.close();
    } catch (e: any) {
      setFixError(e?.response?.data?.detail || e?.message || 'Eroare geocodare');
    } finally {
      setFixing(false);
    }
  }, [fixingPin, fixAddress, isPublic, queryClient]);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editAddress, setEditAddress] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handlePinSubmit = useCallback(async (c: any) => {
    if (!editAddress.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.marcheazaPin({
        address: editAddress.trim(),
        customer_name: c.customer_name,
        color: 'blue',
        note: c.status_label,
      });
      queryClient.invalidateQueries({ queryKey: isPublic ? ['public-gps-pins'] : ['map-pins'] });
      queryClient.invalidateQueries({ queryKey: isPublic ? ['public-gps-comenzi'] : ['comenzi-azi'] });
      setEditingId(null);
      setEditAddress('');
    } catch (e: any) {
      setSaveError(e?.response?.data?.detail || e?.message || 'Eroare geocodare');
    } finally {
      setSaving(false);
    }
  }, [editAddress, isPublic, queryClient]);

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

      // Restaurant marker
      new g.maps.Marker({
        position: { lat: RESTAURANT_LAT, lng: RESTAURANT_LNG },
        map,
        title: 'Restaurant',
        zIndex: 100,
        label: { text: '🏠', fontSize: '20px' },
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

  // ── Search geocoding (debounced) ─────────────────────────────────────────────
  useEffect(() => {
    clearTimeout(searchTimeout.current);
    if (!searchQ.trim()) { setSearchResults([]); return; }
    searchTimeout.current = setTimeout(async () => {
      setSearching(true);
      try {
        const results = await api.geocodeAddress(searchQ);
        setSearchResults(results.slice(0, 5));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 600);
  }, [searchQ]);

  const handleSearchSelect = useCallback((r: { lat: string; lon: string; display_name: string }) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    if (!gMapRef.current) return;
    const g = (window as any).google;
    const map = gMapRef.current;

    // Remove previous search marker
    if (searchMarkerRef.current) { searchMarkerRef.current.setMap(null); searchMarkerRef.current = null; }

    map.panTo({ lat, lng });
    map.setZoom(17);

    const marker = new g.maps.Marker({
      position: { lat, lng },
      map,
      title: r.display_name,
      icon: {
        path: g.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: '#f59e0b',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
      zIndex: 200,
    });
    infoWindowRef.current?.setContent(
      `<div style="font-family:sans-serif;max-width:220px;font-size:12px">${r.display_name}</div>`
    );
    infoWindowRef.current?.open(map, marker);
    searchMarkerRef.current = marker;

    setSearchQ('');
    setSearchResults([]);
  }, []);

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

    deliveryMarkersRef.current.forEach(marker => marker.setMap(null));
    deliveryMarkersRef.current.clear();

    deliveryPins.forEach(pin => {
      const order = findOrder(pin);
      const eta = order?.eta_delivery || '';
      const etaReturn = order?.eta_return || '';
      const travelMin = order?.travel_time_min;
      const createdTime = order?.created_at
        ? order.created_at.slice(11, 16)
        : (order?.time || '');
      const colorHex = PIN_COLORS[pin.color] ?? PIN_COLORS.blue;
      const { dataUrl, w, h } = makeDeliveryPinSvg(colorHex, pin.name, eta ? `ETA ${eta}` : (createdTime || ''));

      const marker = new g.maps.Marker({
        position: { lat: pin.lat, lng: pin.lng },
        map,
        title: pin.name,
        icon: { url: dataUrl, scaledSize: new g.maps.Size(w, h), anchor: new g.maps.Point(w / 2, h) },
      });

      marker.addListener('click', () => {
        infoWindowRef.current?.setContent(
          `<div style="font-family:sans-serif;min-width:160px;max-width:220px">
            <p style="font-weight:700;margin:0 0 6px;font-size:13px;text-transform:capitalize">${pin.name.toLowerCase()}</p>
            ${createdTime ? `<p style="margin:2px 0;font-size:12px">🕐 Comandă: <b>${createdTime}</b></p>` : ''}
            ${eta ? `<p style="margin:2px 0;font-size:12px">📦 La client: <b style="color:#059669">${eta}</b>${etaReturn ? ` <span style="color:#9ca3af;font-size:11px">(↩ ${etaReturn})</span>` : ''}</p>` : ''}
            ${travelMin != null ? `<p style="margin:2px 0;font-size:11px;color:#9ca3af">${travelMin} min drum + 20 min prep</p>` : ''}
            ${order?.status_label ? `<p style="margin:2px 0;font-size:12px">Status: <b>${order.status_label}</b></p>` : ''}
            ${pin.address ? `<p style="margin:2px 0;font-size:11px;color:#6b7280">${pin.address}</p>` : ''}
            <p style="margin:6px 0 0;font-size:11px;color:#d97706;cursor:pointer" onclick="document.dispatchEvent(new CustomEvent('fix-pin',{detail:{id:${pin.id},name:'${pin.name.replace(/'/g, "\\'")}',address:'${(pin.address||'').replace(/'/g, "\\'")}'}}))"">✏ Fix locație</p>
          </div>`
        );
        infoWindowRef.current?.open(map, marker);
      });

      deliveryMarkersRef.current.set(pin.id, marker);
    });
  }, [deliveryPins, mapReady, findOrder]);

  // ── Listen for fix-pin custom event (fired from InfoWindow HTML) ────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { id, name, address } = (e as CustomEvent).detail;
      setFixingPin({ id, name, address });
      setFixAddress(address);
      setFixError(null);
    };
    document.addEventListener('fix-pin', handler);
    return () => document.removeEventListener('fix-pin', handler);
  }, []);

  // ── Auto-fit bounds when pins load ──────────────────────────────────────────
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
            {deliveryPinsCount} livrări
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

        {/* Search box */}
        {mapReady && (
          <div className="relative ml-1">
            <div className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg bg-stone-100 dark:bg-stone-800 border border-transparent focus-within:border-blue-400 focus-within:bg-white dark:focus-within:bg-stone-700 transition-colors">
              <Search className="w-3 h-3 text-stone-400 shrink-0" />
              <input
                type="text"
                value={searchQ}
                onChange={e => setSearchQ(e.target.value)}
                onKeyDown={e => e.key === 'Escape' && (setSearchQ(''), setSearchResults([]))}
                placeholder="Caută adresă..."
                className="bg-transparent text-xs text-stone-700 dark:text-stone-200 placeholder-stone-400 outline-none w-40"
              />
              {searching && <RefreshCw className="w-3 h-3 text-stone-400 animate-spin shrink-0" />}
              {searchQ && !searching && (
                <button onClick={() => { setSearchQ(''); setSearchResults([]); }}>
                  <X className="w-3 h-3 text-stone-400 hover:text-stone-600" />
                </button>
              )}
            </div>
            {searchResults.length > 0 && (
              <div className="absolute top-full left-0 mt-1 w-80 bg-white dark:bg-stone-800 rounded-lg shadow-lg border border-stone-200 dark:border-stone-700 z-[2000] overflow-hidden">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => handleSearchSelect(r)}
                    className="w-full text-left px-3 py-2 text-xs text-stone-700 dark:text-stone-200 hover:bg-stone-100 dark:hover:bg-stone-700 border-b border-stone-100 dark:border-stone-700 last:border-0 truncate transition-colors"
                  >
                    {r.display_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

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

        {/* Fix locație panel */}
        {fixingPin && (
          <div className="absolute bottom-4 left-4 w-72 bg-white/95 dark:bg-stone-900/95 rounded-xl shadow-lg border border-blue-200 dark:border-blue-700 p-3 z-10">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-stone-700 dark:text-stone-200 capitalize truncate flex-1">
                ✏ {fixingPin.name.toLowerCase()}
              </p>
              <button
                onClick={() => setFixingPin(null)}
                className="ml-2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <input
              type="text"
              value={fixAddress}
              onChange={e => setFixAddress(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleFixPin();
                if (e.key === 'Escape') setFixingPin(null);
              }}
              placeholder="Adresa corectă..."
              autoFocus
              className="w-full text-xs px-2 py-1.5 rounded border border-blue-300 dark:border-blue-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 outline-none focus:ring-1 focus:ring-blue-400 mb-1.5"
            />
            {fixError && <p className="text-[10px] text-red-500 mb-1.5 leading-tight">{fixError}</p>}
            <div className="flex gap-1.5">
              <button
                onClick={handleFixPin}
                disabled={fixing || !fixAddress.trim()}
                className="flex items-center gap-1 px-3 py-1 rounded text-xs bg-blue-500 hover:bg-blue-600 text-white disabled:opacity-50 transition-colors"
              >
                {fixing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                Salvează
              </button>
              <button
                onClick={() => setFixingPin(null)}
                disabled={fixing}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600 disabled:opacity-50 transition-colors"
              >
                <X className="w-3 h-3" />
                Anulează
              </button>
            </div>
          </div>
        )}

        {/* Ungeocoded orders panel */}
        {ungeocodedOrders.length > 0 && (
          <div className="absolute bottom-4 right-4 w-72 bg-white/95 dark:bg-stone-900/95 rounded-xl shadow-lg border border-amber-200 dark:border-amber-800 overflow-hidden z-10">
            <button
              onClick={() => setUngeoExpanded(v => !v)}
              className="w-full flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
            >
              <MapPinOff className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs font-semibold flex-1 text-left">
                {ungeocodedOrders.length} adrese negăsite — click pentru corecție
              </span>
              {ungeoExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
            {ungeoExpanded && (
              <div className="max-h-72 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
                {ungeocodedOrders.map((c: any) => (
                  <div key={c.id} className="px-3 py-2 space-y-1">
                    <button
                      className="w-full text-left rounded px-1 -mx-1 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors"
                      onClick={() => {
                        if (editingId === c.id) {
                          setEditingId(null);
                        } else {
                          setEditingId(c.id);
                          setEditAddress(c.address || '');
                          setSaveError(null);
                        }
                      }}
                    >
                      <p className="text-xs font-semibold text-stone-700 dark:text-stone-200 capitalize truncate">
                        {(c.customer_name || '—').toLowerCase()}
                      </p>
                      <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate">
                        {c.address || '—'}
                      </p>
                      {c.phone && (
                        <p className="text-[11px] text-blue-500 dark:text-blue-400">{c.phone}</p>
                      )}
                    </button>
                    {editingId === c.id && (
                      <div className="space-y-1.5 pt-0.5">
                        <input
                          type="text"
                          value={editAddress}
                          onChange={e => setEditAddress(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') handlePinSubmit(c);
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                          placeholder="Adresa corectă..."
                          autoFocus
                          className="w-full text-xs px-2 py-1 rounded border border-amber-300 dark:border-amber-600 bg-white dark:bg-stone-800 text-stone-800 dark:text-stone-200 outline-none focus:ring-1 focus:ring-amber-400"
                        />
                        {saveError && (
                          <p className="text-[10px] text-red-500 leading-tight">{saveError}</p>
                        )}
                        <div className="flex gap-1">
                          <button
                            onClick={() => handlePinSubmit(c)}
                            disabled={saving || !editAddress.trim()}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-emerald-500 hover:bg-emerald-600 text-white disabled:opacity-50 transition-colors"
                          >
                            {saving
                              ? <RefreshCw className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />
                            }
                            Salvează
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            disabled={saving}
                            className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] bg-stone-200 dark:bg-stone-700 text-stone-600 dark:text-stone-300 hover:bg-stone-300 dark:hover:bg-stone-600 disabled:opacity-50 transition-colors"
                          >
                            <X className="w-3 h-3" />
                            Anulează
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
