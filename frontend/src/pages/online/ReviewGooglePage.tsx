import React, { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Star,
  RefreshCw,
  User,
  Award,
  Utensils,
  HeartHandshake,
  Wind,
  ExternalLink,
  AlertCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  ThumbsUp,
  LayoutGrid,
  List,
} from 'lucide-react';
import { clsx } from 'clsx';
import { format, parseISO, subDays, subMonths, subYears } from 'date-fns';
import { ro } from 'date-fns/locale';
import { toast } from 'react-hot-toast';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as ChartTooltip,
  ResponsiveContainer,
} from 'recharts';

import api from '@/services/api';
import { Card, Spinner, EmptyState } from '@/components/ui';
import type { GoogleReview } from '@/types';

// ─── Period filter ──────────────────────────────────────────────────────────

const PERIOD_OPTIONS = [
  { label: 'Toate', value: 'all' },
  { label: '7 zile', value: '7d' },
  { label: '30 zile', value: '30d' },
  { label: '3 luni', value: '3m' },
  { label: '6 luni', value: '6m' },
  { label: '1 an', value: '1y' },
] as const;
type PeriodValue = (typeof PERIOD_OPTIONS)[number]['value'];

function getCutoff(period: PeriodValue): Date | null {
  const now = new Date();
  if (period === '7d') return subDays(now, 7);
  if (period === '30d') return subDays(now, 30);
  if (period === '3m') return subMonths(now, 3);
  if (period === '6m') return subMonths(now, 6);
  if (period === '1y') return subYears(now, 1);
  return null;
}

// null = any; positive int = exact match for 1/2/3; negative = min (-4 means ≥4, -5 means =5)
const SUBRATING_OPTIONS: { label: string; value: number | null; exact?: boolean }[] = [
  { label: 'Toate', value: null },
  { label: '1★', value: 1, exact: true },
  { label: '2★', value: 2, exact: true },
  { label: '3★', value: 3, exact: true },
  { label: '4★', value: 4, exact: true },
  { label: '5★', value: 5, exact: true },
];

// ─── Star rating display ───────────────────────────────────────────────────

function starColorFilled(value: number) {
  if (value <= 2) return 'fill-red-500 text-red-500';
  if (value === 3) return 'fill-amber-400 text-amber-400';
  return 'fill-emerald-500 text-emerald-500';
}

const StarRating: React.FC<{ value: number; max?: number; size?: 'sm' | 'md' }> = ({
  value,
  max = 5,
  size = 'md',
}) => {
  const sz = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const filled = starColorFilled(value);
  return (
    <span className="inline-flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={clsx(sz, i < value ? filled : 'text-stone-300 dark:text-stone-600')}
        />
      ))}
    </span>
  );
};

// ─── Detail rating pill ────────────────────────────────────────────────────

const DetailRating: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number | null;
}> = ({ icon: Icon, label, value }) => {
  if (value === null || value === undefined) return null;
  const color =
    value >= 4
      ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
      : value >= 3
      ? 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400'
      : 'bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400';

  return (
    <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', color)}>
      <Icon className="w-3 h-3" />
      {label}: {value}/5
    </span>
  );
};

// ─── Trend chart ───────────────────────────────────────────────────────────

const TrendChart: React.FC<{ reviews: GoogleReview[] }> = ({ reviews }) => {
  const data = useMemo(() => {
    const byMonth: Record<string, { count: number; sumRating: number }> = {};
    reviews.forEach((r) => {
      const month = r.iso_date.slice(0, 7);
      if (!byMonth[month]) byMonth[month] = { count: 0, sumRating: 0 };
      byMonth[month].count++;
      byMonth[month].sumRating += r.rating;
    });
    return Object.entries(byMonth)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, { count, sumRating }]) => ({
        month,
        label: format(parseISO(month + '-01'), 'MMM yy', { locale: ro }),
        count,
        avg: Math.round((sumRating / count) * 10) / 10,
      }));
  }, [reviews]);

  if (data.length === 0) return null;

  return (
    <ResponsiveContainer width="100%" height={160}>
      <ComposedChart data={data} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,113,108,0.15)" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 10, fill: 'rgb(120,113,108)' }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          yAxisId="count"
          tick={{ fontSize: 10, fill: 'rgb(120,113,108)' }}
          tickLine={false}
          axisLine={false}
          allowDecimals={false}
        />
        <YAxis
          yAxisId="avg"
          orientation="right"
          domain={[1, 5]}
          tick={{ fontSize: 10, fill: 'rgb(16,185,129)' }}
          tickLine={false}
          axisLine={false}
        />
        <ChartTooltip
          contentStyle={{
            fontSize: 12,
            borderRadius: 8,
            border: '1px solid rgba(120,113,108,0.2)',
            backgroundColor: 'var(--tooltip-bg, white)',
          }}
          formatter={(value: any, name: any) =>
            [name === 'count' ? `${value} recenzii` : `${value} ★`, name === 'count' ? 'Recenzii' : 'Rating mediu']
          }
        />
        <Bar yAxisId="count" dataKey="count" fill="#fbbf24" opacity={0.7} radius={[3, 3, 0, 0]} />
        <Line
          yAxisId="avg"
          type="monotone"
          dataKey="avg"
          stroke="#10b981"
          strokeWidth={2}
          dot={{ r: 3, fill: '#10b981' }}
          activeDot={{ r: 5 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
};

// ─── Stats + trend card ────────────────────────────────────────────────────

const StatsBar: React.FC<{
  reviews: GoogleReview[];
  filterStar: number | null;
  onFilterStar: (star: number | null) => void;
  filterLocalGuide: boolean;
  onFilterLocalGuide: () => void;
}> = ({ reviews, filterStar, onFilterStar, filterLocalGuide, onFilterLocalGuide }) => {
  if (reviews.length === 0) return null;

  const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  const dist = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
  }));
  const localGuides = reviews.filter((r) => r.local_guide).length;

  return (
    <Card className="p-4 mb-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: avg + distribution */}
        <div className="flex gap-4 items-start">
          <div className="text-center flex-shrink-0">
            <div className="text-4xl font-bold text-stone-900 dark:text-stone-100">
              {avg.toFixed(1)}
            </div>
            <StarRating value={Math.round(avg)} size="sm" />
            <div className="text-xs text-stone-400 mt-1">{reviews.length} recenzii</div>

            {/* Local Guide toggle */}
            {localGuides > 0 && (
              <button
                onClick={onFilterLocalGuide}
                className={clsx(
                  'mt-2 inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors',
                  filterLocalGuide
                    ? 'bg-blue-600 text-white'
                    : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/50',
                )}
              >
                <Award className="w-3 h-3" />
                {localGuides} Local Guide{localGuides !== 1 ? 's' : ''}
              </button>
            )}
          </div>

          {/* Distribution bars */}
          <div className="flex-1 space-y-1 min-w-0">
            {dist.map(({ star, count }) => {
              const active = filterStar === star;
              const dimmed = filterStar !== null && !active;
              const barColor = star <= 2 ? 'bg-red-500' : star === 3 ? 'bg-amber-400' : 'bg-emerald-500';
              const starFill = star <= 2 ? 'fill-red-500 text-red-500' : star === 3 ? 'fill-amber-400 text-amber-400' : 'fill-emerald-500 text-emerald-500';
              const activeBg = star <= 2 ? 'bg-red-50 dark:bg-red-900/20' : star === 3 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20';
              const activeText = star <= 2 ? 'text-red-600 dark:text-red-400' : star === 3 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400';
              return (
                <button
                  key={star}
                  onClick={() => onFilterStar(active ? null : star)}
                  className={clsx(
                    'w-full flex items-center gap-2 rounded px-1 py-0.5 transition-colors',
                    active ? activeBg : 'hover:bg-stone-50 dark:hover:bg-stone-800/60',
                    dimmed && 'opacity-40',
                  )}
                >
                  <span className={clsx('text-xs w-3 text-right font-semibold', active ? activeText : 'text-stone-500')}>
                    {star}
                  </span>
                  <Star className={clsx('w-3 h-3 flex-shrink-0', starFill)} />
                  <div className="flex-1 bg-stone-100 dark:bg-stone-800 rounded-full h-2 overflow-hidden">
                    <div
                      className={clsx('h-full rounded-full', barColor)}
                      style={{ width: reviews.length ? `${(count / reviews.length) * 100}%` : '0%' }}
                    />
                  </div>
                  <span className={clsx('text-xs w-5 text-left', active ? activeText : 'text-stone-400')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right: trend chart */}
        <div>
          <p className="text-xs text-stone-400 mb-2 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-2 rounded-sm bg-amber-400 opacity-70" /> recenzii/lună
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-4 border-t-2 border-emerald-500" /> rating mediu
            </span>
          </p>
          <TrendChart reviews={reviews} />
        </div>
      </div>
    </Card>
  );
};

// ─── Sub-rating filter row ─────────────────────────────────────────────────

function starColor(v: number | null) {
  if (v === null) return null;
  if (v <= 2) return 'bg-red-600 text-white';
  if (v === 3) return 'bg-amber-500 text-white';
  return 'bg-emerald-600 text-white';
}

const SubRatingFilter: React.FC<{
  icon: React.ElementType;
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
}> = ({ icon: Icon, label, value, onChange }) => (
  <div className="flex items-center gap-1.5">
    <Icon className="w-3.5 h-3.5 text-stone-400 flex-shrink-0" />
    <span className="text-xs text-stone-500 flex-shrink-0">{label}:</span>
    <div className="flex gap-0.5">
      {SUBRATING_OPTIONS.map((opt) => {
        const active = value === opt.value;
        return (
          <button
            key={String(opt.value)}
            onClick={() => onChange(active ? null : opt.value)}
            className={clsx(
              'text-xs px-1.5 py-0.5 rounded transition-colors',
              active
                ? (starColor(opt.value) ?? 'bg-stone-700 text-white dark:bg-stone-300 dark:text-stone-900')
                : 'text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800',
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  </div>
);

// ─── Filter bar ────────────────────────────────────────────────────────────

const FilterBar: React.FC<{
  filterPeriod: PeriodValue;
  onPeriod: (p: PeriodValue) => void;
  filterFoodMin: number | null;
  onFoodMin: (v: number | null) => void;
  filterServiceMin: number | null;
  onServiceMin: (v: number | null) => void;
  filterAtmosphereMin: number | null;
  onAtmosphereMin: (v: number | null) => void;
  activeCount: number;
  onClearAll: () => void;
}> = ({
  filterPeriod,
  onPeriod,
  filterFoodMin,
  onFoodMin,
  filterServiceMin,
  onServiceMin,
  filterAtmosphereMin,
  onAtmosphereMin,
  activeCount,
  onClearAll,
}) => (
  <div className="flex flex-col sm:flex-row gap-3 sm:items-center mb-4 p-3 bg-stone-50 dark:bg-stone-900/50 rounded-xl border border-stone-200 dark:border-stone-800">
    {/* Period */}
    <div className="flex items-center gap-1 flex-wrap">
      {PERIOD_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onPeriod(opt.value)}
          className={clsx(
            'text-xs px-2.5 py-1 rounded-lg font-medium transition-colors',
            filterPeriod === opt.value
              ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900'
              : 'text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 hover:bg-stone-200 dark:hover:bg-stone-800',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>

    <div className="hidden sm:block w-px h-5 bg-stone-200 dark:bg-stone-700 flex-shrink-0" />

    {/* Sub-ratings */}
    <div className="flex flex-col sm:flex-row gap-2 flex-1">
      <SubRatingFilter icon={Utensils} label="Mâncare" value={filterFoodMin} onChange={onFoodMin} />
      <SubRatingFilter icon={HeartHandshake} label="Serviciu" value={filterServiceMin} onChange={onServiceMin} />
      <SubRatingFilter icon={Wind} label="Atmosferă" value={filterAtmosphereMin} onChange={onAtmosphereMin} />
    </div>

    {/* Clear all */}
    {activeCount > 0 && (
      <button
        onClick={onClearAll}
        className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400 underline flex-shrink-0"
      >
        Șterge filtre ({activeCount})
      </button>
    )}
  </div>
);

// ─── Single review card ────────────────────────────────────────────────────

const ReviewCard: React.FC<{ review: GoogleReview }> = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const longSnippet = (review.snippet || '').length > 220;
  const displaySnippet =
    longSnippet && !expanded ? review.snippet!.slice(0, 220) + '…' : review.snippet;

  const hasExtra =
    review.snippet_translated ||
    (review.images && review.images.length > 0) ||
    review.likes > 0 ||
    (review.details && Object.keys(review.details).length > 0);

  return (
    <Card className="p-4">
      {/* Clickable header */}
      <div
        className={clsx('flex items-start gap-3', hasExtra && 'cursor-pointer')}
        onClick={() => hasExtra && setExpanded((e) => !e)}
      >
        {/* Avatar */}
        <div className="flex-shrink-0">
          {review.user_thumbnail ? (
            <img
              src={review.user_thumbnail}
              alt={review.user_name || ''}
              className="w-10 h-10 rounded-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          ) : (
            <div className="w-10 h-10 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center">
              <User className="w-5 h-5 text-stone-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-stone-900 dark:text-stone-100 text-sm">
                  {review.user_name || 'Anonim'}
                </span>
                {review.local_guide && (
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400 uppercase tracking-wide">
                    <Award className="w-3 h-3" />
                    Local Guide
                  </span>
                )}
              </div>
              {(review.user_reviews_count > 0 || review.user_photos_count > 0) && (
                <p className="text-[11px] text-stone-400 mt-0.5">
                  {review.user_reviews_count > 0 && `${review.user_reviews_count} recenzii`}
                  {review.user_reviews_count > 0 && review.user_photos_count > 0 && ' · '}
                  {review.user_photos_count > 0 && `${review.user_photos_count} foto`}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <div className="text-right">
                <StarRating value={review.rating} />
                <p className="text-xs text-stone-400 mt-0.5">
                  {format(parseISO(review.iso_date), 'dd MMM yyyy', { locale: ro })}
                </p>
              </div>
              {hasExtra && (
                <div className="text-stone-400">
                  {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </div>
              )}
            </div>
          </div>

          {/* Detail ratings */}
          {(review.food_rating !== null ||
            review.service_rating !== null ||
            review.atmosphere_rating !== null) && (
            <div className="flex flex-wrap gap-1.5 mt-2">
              <DetailRating icon={Utensils} label="Mâncare" value={review.food_rating} />
              <DetailRating icon={HeartHandshake} label="Serviciu" value={review.service_rating} />
              <DetailRating icon={Wind} label="Atmosferă" value={review.atmosphere_rating} />
            </div>
          )}

          {/* Snippet */}
          {review.snippet && (
            <div className="mt-2">
              <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                {displaySnippet}
              </p>
              {longSnippet && !expanded && (
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(true); }}
                  className="text-xs text-red-600 dark:text-red-400 hover:underline mt-1"
                >
                  Citește tot
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Expanded section */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-stone-100 dark:border-stone-800 space-y-3 ml-13">
          {/* Translated snippet */}
          {review.snippet_translated && review.snippet_translated !== review.snippet && (
            <div className="bg-blue-50 dark:bg-blue-900/10 rounded-lg p-3">
              <p className="text-[11px] text-blue-500 dark:text-blue-400 font-medium mb-1 uppercase tracking-wide">
                Traducere
              </p>
              <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed italic">
                {review.snippet_translated}
              </p>
            </div>
          )}

          {/* Owner answer */}
          {review.details?.owner_answer && (
            <div className="bg-emerald-50 dark:bg-emerald-900/10 rounded-lg p-3">
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mb-1 uppercase tracking-wide">
                Răspuns proprietar
                {review.details.owner_answer_date && (
                  <span className="ml-2 font-normal normal-case">· {review.details.owner_answer_date}</span>
                )}
              </p>
              <p className="text-sm text-stone-700 dark:text-stone-300 leading-relaxed">
                {review.details.owner_answer}
              </p>
            </div>
          )}

          {/* Images */}
          {review.images && review.images.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {review.images.slice(0, 6).map((img, i) => (
                <a key={i} href={img} target="_blank" rel="noopener noreferrer">
                  <img
                    src={img}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover border border-stone-200 dark:border-stone-700 hover:opacity-80 transition-opacity"
                  />
                </a>
              ))}
            </div>
          )}

          {/* Footer: likes + link + date text */}
          <div className="flex items-center gap-3 flex-wrap text-xs text-stone-400">
            {review.likes > 0 && (
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                {review.likes} util{review.likes !== 1 ? 'e' : ''}
              </span>
            )}
            {review.date_text && (
              <span>{review.date_text}</span>
            )}
            {review.review_link && (
              <a
                href={review.review_link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 hover:text-stone-600 dark:hover:text-stone-300"
              >
                <ExternalLink className="w-3 h-3" />
                Deschide în Google
              </a>
            )}
          </div>
        </div>
      )}
    </Card>
  );
};

// ─── Grid card (compact, for grid view) ───────────────────────────────────

const ReviewCardGrid: React.FC<{ review: GoogleReview }> = ({ review }) => {
  const [expanded, setExpanded] = useState(false);
  const snippet = review.snippet || '';
  const truncated = snippet.length > 130 ? snippet.slice(0, 130) + '…' : snippet;
  const ratingBg =
    review.rating >= 4
      ? 'bg-emerald-500'
      : review.rating === 3
      ? 'bg-amber-500'
      : 'bg-red-500';

  return (
    <Card className="p-4 flex flex-col gap-2.5 h-full">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="flex-shrink-0">
          {review.user_thumbnail ? (
            <img
              src={review.user_thumbnail}
              alt={review.user_name || ''}
              className="w-9 h-9 rounded-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-stone-200 dark:bg-stone-700 flex items-center justify-center">
              <User className="w-4 h-4 text-stone-400" />
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1">
            <span className="text-xs font-semibold text-stone-900 dark:text-stone-100 truncate">
              {review.user_name || 'Anonim'}
            </span>
            {review.local_guide && <Award className="w-3 h-3 text-blue-500 flex-shrink-0" />}
          </div>
          <p className="text-[10px] text-stone-400">
            {format(parseISO(review.iso_date), 'dd MMM yyyy', { locale: ro })}
          </p>
        </div>
        {/* Rating badge */}
        <div className={clsx('flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm', ratingBg)}>
          {review.rating}
        </div>
      </div>

      {/* Stars */}
      <StarRating value={review.rating} size="sm" />

      {/* Sub-ratings */}
      {(review.food_rating !== null || review.service_rating !== null || review.atmosphere_rating !== null) && (
        <div className="flex gap-1 flex-wrap">
          <DetailRating icon={Utensils} label="M" value={review.food_rating} />
          <DetailRating icon={HeartHandshake} label="S" value={review.service_rating} />
          <DetailRating icon={Wind} label="A" value={review.atmosphere_rating} />
        </div>
      )}

      {/* Snippet */}
      {snippet && (
        <div className="flex-1">
          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            {expanded ? snippet : truncated}
          </p>
          {snippet.length > 130 && (
            <button
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] text-red-500 hover:underline mt-0.5"
            >
              {expanded ? 'Mai puțin' : 'Citește tot'}
            </button>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between mt-auto pt-2 border-t border-stone-100 dark:border-stone-800">
        <span className="text-[10px] text-stone-400">{review.date_text || ''}</span>
        <div className="flex items-center gap-2">
          {review.likes > 0 && (
            <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
              <ThumbsUp className="w-2.5 h-2.5" />{review.likes}
            </span>
          )}
          {review.review_link && (
            <a
              href={review.review_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 inline-flex items-center gap-0.5"
            >
              <ExternalLink className="w-3 h-3" />
              Google
            </a>
          )}
        </div>
      </div>
    </Card>
  );
};

// ─── Refresh button with cooldown ──────────────────────────────────────────

const RefreshButton: React.FC = () => {
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ['google-reviews-status'],
    queryFn: () => api.getGoogleReviewsStatus(),
    refetchInterval: 10_000,
    staleTime: 0,
  });

  const remaining = status?.remaining_seconds ?? 0;
  const canRefresh = remaining === 0;

  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (remaining === 0) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [remaining]);

  const displayed = Math.max(0, remaining - tick);
  const mins = Math.floor(displayed / 60);
  const secs = displayed % 60;
  const countdownLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

  const mutation = useMutation({
    mutationFn: () => api.refreshGoogleReviews(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['google-reviews'] });
      queryClient.invalidateQueries({ queryKey: ['google-reviews-status'] });
      setTick(0);
      if (result.inserted > 0) {
        toast.success(`${result.inserted} recenzii noi adăugate (${result.pages_fetched} pagini)`, {
          duration: 5000,
        });
      } else {
        toast.success('Nicio recenzie nouă — ești la zi!');
      }
    },
    onError: (err: any) => {
      const detail = err.response?.data?.detail;
      if (detail?.remaining_seconds) {
        queryClient.invalidateQueries({ queryKey: ['google-reviews-status'] });
        setTick(0);
      } else {
        toast.error(detail?.message || detail || 'Eroare la refresh');
      }
    },
  });

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={() => { if (canRefresh) mutation.mutate(); }}
        disabled={!canRefresh || mutation.isPending}
        className={clsx(
          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
          canRefresh && !mutation.isPending
            ? 'bg-white dark:bg-stone-800 border border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:bg-stone-50 dark:hover:bg-stone-700'
            : 'bg-stone-100 dark:bg-stone-800 border border-stone-200 dark:border-stone-700 text-stone-400 dark:text-stone-500 cursor-not-allowed',
        )}
      >
        <RefreshCw className={clsx('w-4 h-4', mutation.isPending && 'animate-spin')} />
        Refresh
      </button>

      {!canRefresh && displayed > 0 && (
        <div className="flex items-center gap-1 text-xs text-stone-400 dark:text-stone-500">
          <Clock className="w-3 h-3" />
          <span>disponibil în {countdownLabel}</span>
        </div>
      )}

      {status?.last_refresh && canRefresh && (
        <p className="text-[11px] text-stone-400">
          ultima dată: {format(parseISO(status.last_refresh), 'dd MMM HH:mm', { locale: ro })}
        </p>
      )}
    </div>
  );
};

// ─── Pagination controls ───────────────────────────────────────────────────

const PAGE_SIZE = 50;

const Pagination: React.FC<{
  page: number;
  totalPages: number;
  total: number;
  onPage: (p: number) => void;
  viewMode?: 'list' | 'grid';
  onViewMode?: (m: 'list' | 'grid') => void;
}> = ({ page, totalPages, total, onPage, viewMode, onViewMode }) => {
  if (totalPages <= 1 && !onViewMode) return null;

  const from = totalPages > 1 ? (page - 1) * PAGE_SIZE + 1 : 1;
  const to = totalPages > 1 ? Math.min(page * PAGE_SIZE, total) : total;

  const pages: (number | '…')[] = [];
  const add = new Set<number>();
  [1, page - 1, page, page + 1, totalPages].forEach((p) => {
    if (p >= 1 && p <= totalPages) add.add(p);
  });
  const sorted = Array.from(add).sort((a, b) => a - b);
  sorted.forEach((p, i) => {
    if (i > 0 && p - sorted[i - 1] > 1) pages.push('…');
    pages.push(p);
  });

  return (
    <div className="flex items-center justify-between mt-4 pt-4 border-t border-stone-200 dark:border-stone-800">
      <span className="text-xs text-stone-400">
        {from}–{to} din {total} recenzii
      </span>
      <div className="flex items-center gap-2">
        {/* View toggle */}
        {onViewMode && (
          <div className="flex items-center bg-stone-100 dark:bg-stone-800 rounded-lg p-0.5 gap-0.5">
            <button
              onClick={() => onViewMode('list')}
              title="Listă"
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'list'
                  ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300',
              )}
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => onViewMode('grid')}
              title="Carduri"
              className={clsx(
                'p-1.5 rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm'
                  : 'text-stone-400 hover:text-stone-600 dark:hover:text-stone-300',
              )}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Page buttons */}
        {totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => onPage(page - 1)}
              disabled={page === 1}
              className="px-2 py-1 text-xs rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              ‹
            </button>
            {pages.map((p, i) =>
              p === '…' ? (
                <span key={`e${i}`} className="px-1 text-xs text-stone-400">…</span>
              ) : (
                <button
                  key={p}
                  onClick={() => onPage(p)}
                  className={clsx(
                    'w-7 h-7 text-xs rounded-lg transition-colors',
                    p === page
                      ? 'bg-stone-800 dark:bg-stone-200 text-white dark:text-stone-900 font-semibold'
                      : 'border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400',
                  )}
                >
                  {p}
                </button>
              )
            )}
            <button
              onClick={() => onPage(page + 1)}
              disabled={page === totalPages}
              className="px-2 py-1 text-xs rounded-lg border border-stone-200 dark:border-stone-700 disabled:opacity-30 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              ›
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main page ─────────────────────────────────────────────────────────────

export const ReviewGooglePage: React.FC = () => {
  const [filterStar, setFilterStar] = useState<number | null>(null);
  const [filterLocalGuide, setFilterLocalGuide] = useState(false);
  const [filterPeriod, setFilterPeriod] = useState<PeriodValue>('all');
  const [filterFoodMin, setFilterFoodMin] = useState<number | null>(null);
  const [filterServiceMin, setFilterServiceMin] = useState<number | null>(null);
  const [filterAtmosphereMin, setFilterAtmosphereMin] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const { data: reviews = [], isLoading, isError } = useQuery({
    queryKey: ['google-reviews'],
    queryFn: () => api.getGoogleReviews(),
    staleTime: 60_000,
  });

  const displayed = useMemo(() => {
    const cutoff = getCutoff(filterPeriod);
    return reviews.filter((r) => {
      if (filterStar !== null && r.rating !== filterStar) return false;
      if (filterLocalGuide && !r.local_guide) return false;
      if (cutoff && parseISO(r.iso_date) < cutoff) return false;
      if (filterFoodMin !== null && r.food_rating !== filterFoodMin) return false;
      if (filterServiceMin !== null && r.service_rating !== filterServiceMin) return false;
      if (filterAtmosphereMin !== null && r.atmosphere_rating !== filterAtmosphereMin) return false;
      return true;
    });
  }, [reviews, filterStar, filterLocalGuide, filterPeriod, filterFoodMin, filterServiceMin, filterAtmosphereMin]);

  // Reset to page 1 when filters change
  useEffect(() => { setPage(1); }, [filterStar, filterLocalGuide, filterPeriod, filterFoodMin, filterServiceMin, filterAtmosphereMin]);

  const totalPages = Math.ceil(displayed.length / PAGE_SIZE);
  const pageReviews = displayed.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const activeFilterCount = [
    filterStar !== null,
    filterLocalGuide,
    filterPeriod !== 'all',
    filterFoodMin !== null,
    filterServiceMin !== null,
    filterAtmosphereMin !== null,
  ].filter(Boolean).length;

  const clearAll = () => {
    setFilterStar(null);
    setFilterLocalGuide(false);
    setFilterPeriod('all');
    setFilterFoodMin(null);
    setFilterServiceMin(null);
    setFilterAtmosphereMin(null);
  };

  const subtitle =
    reviews.length === 0
      ? 'Dă Refresh pentru a prelua recenziile'
      : activeFilterCount > 0
      ? `${displayed.length} din ${reviews.length} recenzii`
      : `${reviews.length} recenzii · de la cele mai noi`;

  const goToPage = (p: number) => {
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-stone-900 dark:text-stone-100 flex items-center gap-2">
            <Star className="w-6 h-6 text-amber-400 fill-amber-400" />
            Review Google
          </h1>
          <p className="text-stone-500 text-sm mt-0.5">{subtitle}</p>
        </div>
        <RefreshButton />
      </div>

      {/* Stats + trend */}
      {reviews.length > 0 && (
        <StatsBar
          reviews={reviews}
          filterStar={filterStar}
          onFilterStar={setFilterStar}
          filterLocalGuide={filterLocalGuide}
          onFilterLocalGuide={() => setFilterLocalGuide((v) => !v)}
        />
      )}

      {/* Filter bar */}
      {reviews.length > 0 && (
        <FilterBar
          filterPeriod={filterPeriod}
          onPeriod={setFilterPeriod}
          filterFoodMin={filterFoodMin}
          onFoodMin={setFilterFoodMin}
          filterServiceMin={filterServiceMin}
          onServiceMin={setFilterServiceMin}
          filterAtmosphereMin={filterAtmosphereMin}
          onAtmosphereMin={setFilterAtmosphereMin}
          activeCount={activeFilterCount}
          onClearAll={clearAll}
        />
      )}

      {/* Content */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : isError ? (
        <Card className="p-8">
          <div className="flex flex-col items-center gap-2 text-red-500">
            <AlertCircle className="w-8 h-8" />
            <p>Eroare la încărcare recenzii</p>
          </div>
        </Card>
      ) : reviews.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Star className="w-12 h-12 text-amber-400" />}
            title="Nu există recenzii"
            description="Apasă Refresh pentru a prelua recenziile din Google."
          />
        </Card>
      ) : displayed.length === 0 ? (
        <Card className="p-6">
          <div className="text-center space-y-2">
            <p className="text-stone-400 text-sm">Nicio recenzie nu corespunde filtrelor selectate.</p>
            <button onClick={clearAll} className="text-xs text-red-500 hover:underline">
              Șterge toate filtrele
            </button>
          </div>
        </Card>
      ) : (
        <div>
          <Pagination
            page={page}
            totalPages={totalPages}
            total={displayed.length}
            onPage={goToPage}
            viewMode={viewMode}
            onViewMode={setViewMode}
          />
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {pageReviews.map((review) => (
                <ReviewCardGrid key={review.review_id} review={review} />
              ))}
            </div>
          ) : (
            <div className="space-y-3 mt-3">
              {pageReviews.map((review) => (
                <ReviewCard key={review.review_id} review={review} />
              ))}
            </div>
          )}
          <Pagination
            page={page}
            totalPages={totalPages}
            total={displayed.length}
            onPage={goToPage}
            viewMode={viewMode}
            onViewMode={setViewMode}
          />
        </div>
      )}
    </div>
  );
};
