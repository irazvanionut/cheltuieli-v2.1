import React, { useState, useMemo } from 'react';
import { clsx } from 'clsx';
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from 'lucide-react';
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  isSameDay,
  isSameMonth,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek,
  parseISO,
} from 'date-fns';
import { ro } from 'date-fns/locale';

interface DatePickerCalendarProps {
  selectedDate: string; // YYYY-MM-DD format
  availableDates: string[]; // Array of YYYY-MM-DD strings
  onSelectDate: (date: string) => void;
}

export const DatePickerCalendar: React.FC<DatePickerCalendarProps> = ({
  selectedDate,
  availableDates,
  onSelectDate,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [currentMonth, setCurrentMonth] = useState(() => {
    return selectedDate ? parseISO(selectedDate) : new Date();
  });

  // Convert available dates to Set for O(1) lookup
  const availableDatesSet = useMemo(
    () => new Set(availableDates),
    [availableDates]
  );

  // Generate calendar days for current month view
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 }); // Monday
    const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });

    return eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  }, [currentMonth]);

  const handlePreviousMonth = () => {
    setCurrentMonth((prev) => subMonths(prev, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth((prev) => addMonths(prev, 1));
  };

  const handleSelectDate = (day: Date) => {
    const dateStr = format(day, 'yyyy-MM-dd');
    if (availableDatesSet.has(dateStr)) {
      onSelectDate(dateStr);
      setIsOpen(false);
    }
  };

  const selectedDateObj = selectedDate ? parseISO(selectedDate) : null;

  const weekDays = ['Lu', 'Ma', 'Mi', 'Jo', 'Vi', 'Sâ', 'Du'];

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg border border-stone-300 dark:border-stone-600 bg-white dark:bg-stone-800 text-sm text-stone-900 dark:text-stone-100 hover:bg-stone-50 dark:hover:bg-stone-700 transition-colors"
      >
        <CalendarIcon className="w-4 h-4 text-stone-400" />
        <span>{selectedDate || 'Selectează data'}</span>
      </button>

      {/* Calendar dropdown */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />

          {/* Calendar panel */}
          <div className="absolute top-full mt-2 right-0 z-20 bg-white dark:bg-stone-900 rounded-xl border border-stone-200 dark:border-stone-700 shadow-xl p-4 min-w-[320px]">
            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={handlePreviousMonth}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h3 className="text-sm font-semibold text-stone-900 dark:text-stone-100 capitalize">
                {format(currentMonth, 'MMMM yyyy', { locale: ro })}
              </h3>
              <button
                onClick={handleNextMonth}
                className="p-1 rounded-lg hover:bg-stone-100 dark:hover:bg-stone-800 text-stone-600 dark:text-stone-400"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>

            {/* Week days header */}
            <div className="grid grid-cols-7 gap-1 mb-2">
              {weekDays.map((day) => (
                <div
                  key={day}
                  className="text-center text-xs font-medium text-stone-500 dark:text-stone-400 py-1"
                >
                  {day}
                </div>
              ))}
            </div>

            {/* Calendar days grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((day) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const isAvailable = availableDatesSet.has(dateStr);
                const isSelected =
                  selectedDateObj && isSameDay(day, selectedDateObj);
                const isCurrentMonth = isSameMonth(day, currentMonth);

                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => handleSelectDate(day)}
                    disabled={!isAvailable}
                    className={clsx(
                      'aspect-square rounded-lg text-sm font-medium transition-all',
                      'flex items-center justify-center',
                      {
                        // Selected date
                        'bg-amber-500 text-white hover:bg-amber-600':
                          isSelected && isAvailable,

                        // Available dates (not selected)
                        'bg-emerald-50 dark:bg-emerald-900/20 text-stone-900 dark:text-stone-100 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 ring-1 ring-emerald-200 dark:ring-emerald-800':
                          !isSelected && isAvailable && isCurrentMonth,

                        // Unavailable dates in current month
                        'text-stone-300 dark:text-stone-700 cursor-not-allowed':
                          !isAvailable && isCurrentMonth,

                        // Days from other months
                        'text-stone-200 dark:text-stone-800 cursor-not-allowed':
                          !isCurrentMonth,
                      }
                    )}
                  >
                    {format(day, 'd')}
                  </button>
                );
              })}
            </div>

            {/* Legend */}
            <div className="mt-4 pt-4 border-t border-stone-200 dark:border-stone-700">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-emerald-100 dark:bg-emerald-900/30 ring-1 ring-emerald-200 dark:ring-emerald-800" />
                  <span className="text-stone-600 dark:text-stone-400">
                    Cu date
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-3 h-3 rounded bg-amber-500" />
                  <span className="text-stone-600 dark:text-stone-400">
                    Selectată
                  </span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
