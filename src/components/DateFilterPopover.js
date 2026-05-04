import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock2Icon, ChevronDown } from 'lucide-react';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils";

// Generate ["00:00", "00:30", "01:00" ... "23:30"]
const halfHourOptions = Array.from({ length: 48 }).map((_, i) => {
    const totalMinutes = i * 30;
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
});

// Helper to extract 24-hour time (e.g., "13:30")
const get24HourString = (date) => {
    if (!date) return "00:00";
    const d = new Date(date);
    // Round to nearest 30 mins for the picker display if needed, 
    // but usually we just want to show the actual time if it's set
    return format(d, "HH:mm");
};

function CustomTimePicker({ date, onChange, disabled }) {
    const time24 = get24HourString(date);

    const updateDate = (newTime24) => {
        if (!date) return;
        const [h, m] = newTime24.split(':').map(Number);

        const updated = new Date(date);
        updated.setHours(h, m, 0, 0);
        onChange(updated);
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    disabled={disabled}
                    className={cn(
                        "w-full justify-between bg-transparent border-slate-200 font-normal h-9",
                        !date && "text-muted-foreground"
                    )}
                >
                    <div className="flex items-center gap-2">
                        <Clock2Icon className="h-4 w-4 opacity-50" />
                        {date ? time24 : "Select time"}
                    </div>
                    <ChevronDown className="h-4 w-4 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0 flex h-[200px]" align="start">
                <div className="flex flex-col w-32 overflow-y-auto p-1 custom-scrollbar">
                    {halfHourOptions.map((t) => (
                        <Button
                            key={t}
                            variant="ghost"
                            className={cn(
                                "justify-center font-normal px-2 py-1 h-8 shrink-0",
                                time24 === t && "bg-blue-600 text-white hover:bg-blue-700 hover:text-white"
                            )}
                            onClick={() => updateDate(t)}
                        >
                            {t}
                        </Button>
                    ))}
                </div>
            </PopoverContent>
        </Popover>
    );
}

export function DateFilterPopover({ title, onApply, initialFrom, initialTo }) {
    const [open, setOpen] = useState(false);
    const [hoveredDate, setHoveredDate] = useState(null);
    const [dateRange, setDateRange] = useState({
        from: initialFrom ? new Date(initialFrom) : undefined,
        to: initialTo ? new Date(initialTo) : undefined,
    });
    const [appliedRange, setAppliedRange] = useState({
        from: initialFrom ? new Date(initialFrom) : undefined,
        to: initialTo ? new Date(initialTo) : undefined,
    });

    useEffect(() => {
        setDateRange({
            from: initialFrom ? new Date(initialFrom) : undefined,
            to: initialTo ? new Date(initialTo) : undefined,
        });
        setAppliedRange({
            from: initialFrom ? new Date(initialFrom) : undefined,
            to: initialTo ? new Date(initialTo) : undefined,
        });
    }, [initialFrom, initialTo]);

    const handleOpenChange = (newOpen) => {
        if (!newOpen) {
            setDateRange({ ...appliedRange });
        }
        setOpen(newOpen);
    };

    const handleApply = () => {
        if (!dateRange.from || !dateRange.to) {
            setDateRange({ from: undefined, to: undefined });
            setAppliedRange({ from: undefined, to: undefined });
            onApply({ from: null, to: null });
        } else {
            setAppliedRange({ ...dateRange });
            onApply(dateRange);
        }
        setOpen(false);
    };

    const handleClear = () => {
        setDateRange({ from: undefined, to: undefined });
        setAppliedRange({ from: undefined, to: undefined });
        onApply({ from: null, to: null });
        setOpen(false);
    };

    const handleDateSelect = (newRange, selectedDay) => {
        if (!selectedDay) return;

        if (!dateRange?.from || (dateRange?.from && dateRange?.to)) {
            const newFrom = new Date(selectedDay);
            if (dateRange?.from) {
                newFrom.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), 0, 0);
            } else {
                newFrom.setHours(0, 0, 0, 0);
            }
            setDateRange({ from: newFrom, to: undefined });
            return;
        }

        let rawFrom = dateRange.from;
        let rawTo = selectedDay;

        const dayFrom = new Date(rawFrom).setHours(0, 0, 0, 0);
        const dayTo = new Date(rawTo).setHours(0, 0, 0, 0);

        if (dayTo < dayFrom) {
            rawTo = dateRange.from;
            rawFrom = selectedDay;
        }

        const updatedRange = {
            from: new Date(rawFrom),
            to: new Date(rawTo),
        };

        if (updatedRange.from) {
            if (dateRange?.from && rawFrom === dateRange.from) {
                updatedRange.from.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), 0, 0);
            } else {
                updatedRange.from.setHours(0, 0, 0, 0);
            }
        }

        if (updatedRange.to) {
            if (dateRange?.to && rawTo === dateRange.to) {
                updatedRange.to.setHours(dateRange.to.getHours(), dateRange.to.getMinutes(), 0, 0);
            } else {
                updatedRange.to.setHours(23, 30, 0, 0);
            }
        }

        setDateRange(updatedRange);
    };

    return (
        <Popover open={open} onOpenChange={handleOpenChange} modal={false}>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-slate-200 h-9 text-xs shadow-none hover:bg-slate-50">
                    <CalendarIcon className="h-3.5 w-3.5 mr-2 shrink-0 text-slate-400" />
                    {appliedRange?.from ? (
                        appliedRange.to ? (
                            <span className="truncate text-slate-900">
                                {format(appliedRange.from, "LLL dd")} - {format(appliedRange.to, "LLL dd")}
                            </span>
                        ) : (
                            <span className="truncate text-slate-900">{format(appliedRange.from, "LLL dd, y")}</span>
                        )
                    ) : (
                        <span className="text-slate-500 truncate">{title}</span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent 
                className="w-auto p-1 py-2 overflow-y-auto overflow-x-hidden custom-scrollbar" 
                align="start"
                collisionPadding={20}
            >
                <Card className="w-full sm:w-fit shadow-none border-0 pt-0">
                    <CardHeader className="border-b pt-3 px-3 pb-3 m-0 flex flex-col sm:flex-row gap-4 sm:gap-8 bg-slate-50/50">
                        <div className="w-full text-xs">
                            <span className="text-slate-500">Filter by</span>
                            <br />
                            <span className='font-semibold text-lg text-slate-900'>
                                {title}
                            </span>
                        </div>
                        <div className="flex w-full justify-start sm:justify-end items-center">
                            <div className="flex flex-col gap-1 text-[11px]">
                                <div className="flex justify-between items-center gap-4">
                                    <span className="font-medium text-slate-400 uppercase tracking-wider">From:</span>
                                    <span className="text-slate-900 font-bold">
                                        {dateRange?.from ? format(dateRange.from, "do MMM yyyy - HH:mm") : "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center gap-4">
                                    <span className="font-medium text-slate-400 uppercase tracking-wider">To:</span>
                                    <span className="text-slate-900 font-bold">
                                        {dateRange?.to ? format(dateRange.to, "do MMM yyyy - HH:mm") : "—"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex flex-col sm:flex-row gap-4 py-4 m-0 px-3 sm:px-4">
                        <div className="flex flex-col gap-3 w-full">
                            <Calendar
                                mode="range"
                                defaultMonth={dateRange?.from}
                                numberOfMonths={1}
                                selected={dateRange}
                                onSelect={handleDateSelect}
                                onDayMouseEnter={(day) => setHoveredDate(day)}
                                onDayMouseLeave={() => setHoveredDate(null)}
                                disabled={{ after: new Date() }}
                                className="rounded-md border-none p-0 w-full flex-1"
                            />
                        </div>

                        <div className="flex flex-col gap-4 sm:border-l sm:pl-4 sm:min-w-[180px] justify-start w-full sm:w-auto mt-2 sm:mt-0 pt-4 sm:pt-0 border-t sm:border-t-0 px-1 sm:px-0">
                            <FieldGroup className="gap-4">
                                <Field>
                                    <FieldLabel className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">From Time</FieldLabel>
                                    <CustomTimePicker
                                        date={dateRange.from}
                                        disabled={!dateRange.from}
                                        onChange={(d) => setDateRange(prev => ({ ...prev, from: d }))}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel className="text-[10px] uppercase font-bold text-slate-400 mb-1 block">To Time</FieldLabel>
                                    <CustomTimePicker
                                        date={dateRange.to}
                                        disabled={!dateRange.to}
                                        onChange={(d) => setDateRange(prev => ({ ...prev, to: d }))}
                                    />
                                </Field>
                            </FieldGroup>

                            <div className="flex flex-col items-center gap-2 mt-auto pt-4">
                                <Button
                                    variant="ghost"
                                    className="w-full text-xs h-8 text-slate-500 hover:text-slate-900"
                                    onClick={handleClear}
                                >
                                    Clear
                                </Button>
                                <Button
                                    className="w-full text-sm h-9 bg-blue-600 hover:bg-blue-700 text-white"
                                    onClick={handleApply}
                                >
                                    Apply Filter
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </PopoverContent>
        </Popover>
    );
}
