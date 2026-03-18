import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Clock2Icon, ChevronDown } from 'lucide-react';

import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { cn } from "@/lib/utils"; // Assuming you have standard shadcn cn utility

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
    d.setMinutes(d.getMinutes() < 30 ? 0 : 30);
    return format(d, "HH:mm");
};

// --- NEW CUSTOM DROPDOWN COMPONENT ---
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
                        "w-full justify-between bg-transparent border-slate-200 font-normal",
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
                {/* Scrollable Times */}
                <div className="flex flex-col w-32 overflow-y-auto p-1 custom-scrollbar">
                    {halfHourOptions.map((t) => (
                        <Button
                            key={t}
                            variant="ghost"
                            className={cn(
                                "justify-center font-normal px-2 py-1 h-8 shrink-0",
                                time24 === t && "bg-blue-600 text-white"
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
// -------------------------------------

export function DateFilterPopover({ title, onApply, initialFrom, initialTo }) {
    const [dateRange, setDateRange] = useState({
        from: initialFrom ? new Date(initialFrom) : undefined,
        to: initialTo ? new Date(initialTo) : undefined,
    });

    useEffect(() => {
        setDateRange({
            from: initialFrom ? new Date(initialFrom) : undefined,
            to: initialTo ? new Date(initialTo) : undefined,
        });
    }, [initialFrom, initialTo]);

    // Intercept calendar selection to preserve the currently selected times
    const handleDateSelect = (newRange) => {
        if (!newRange) {
            setDateRange({ from: undefined, to: undefined });
            return;
        }

        // Deep clone the dates to ensure 'from' and 'to' don't share a reference
        const updatedRange = {
            from: newRange.from ? new Date(newRange.from) : undefined,
            to: newRange.to ? new Date(newRange.to) : undefined,
        };

        if (updatedRange.from) {
            if (dateRange?.from) {
                // Preserve existing time if the user already tweaked it
                updatedRange.from.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), 0, 0);
            } else {
                // Default to 12:00 AM
                updatedRange.from.setHours(0, 0, 0, 0);
            }
        }

        if (updatedRange.to) {
            if (dateRange?.to) {
                // Preserve existing time if the user already tweaked it
                updatedRange.to.setHours(dateRange.to.getHours(), dateRange.to.getMinutes(), 0, 0);
            } else {
                // Default to 11:30 PM
                updatedRange.to.setHours(23, 30, 0, 0);
            }
        }

        setDateRange(updatedRange);
    };


    // const handleDateSelect = (newRange) => {
    //     if (!newRange) {
    //         setDateRange({ from: undefined, to: undefined });
    //         return;
    //     }

    //     const updatedRange = { ...newRange };

    //     if (updatedRange.from && dateRange.from) {
    //         updatedRange.from.setHours(dateRange.from.getHours(), dateRange.from.getMinutes(), dateRange.from.getSeconds());
    //     }

    //     if (updatedRange.to && dateRange.to) {
    //         updatedRange.to.setHours(dateRange.to.getHours(), dateRange.to.getMinutes(), dateRange.to.getSeconds());
    //     }

    //     setDateRange(updatedRange);
    // };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-slate-200 h-9 text-xs">
                    <CalendarIcon className="h-3.5 w-3.5 mr-2" />
                    {dateRange?.from ? (
                        dateRange.to ? (
                            <span className="truncate">
                                {format(dateRange.from, "LLL dd")} - {format(dateRange.to, "LLL dd")}
                            </span>
                        ) : (
                            <span className="truncate">{format(dateRange.from, "LLL dd, y")}</span>
                        )
                    ) : (
                        <span className="text-slate-500">{title}</span>
                    )}
                </Button>
            </PopoverTrigger>

            <PopoverContent className="w-auto p-0" align="start">
                <Card className="w-fit shadow-none border-0 pt-0">
                    <CardHeader className="border-b pt-4 px-4 m-0 flex">
                        <div className=" w-full text-sm">
                            Select Ranges for
                            <br />
                            <span className='font-bold text-xl py-3 rounded-full'>
                                {title}
                            </span>
                        </div>
                        <div className={"flex w-full justify-center pt-2"}>
                            <div className="flex flex-col gap-1 text-sm w-fit ">
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-slate-500 pr-2">From:</span>
                                    <span className="px-2 py-0.5 rounded-md text-black font-extrabold text-sm">
                                        {dateRange?.from ? format(dateRange.from, "do MMM yyyy - HH:mm") : "—"}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="font-medium text-slate-500 pr-2">To:</span>
                                    <span className="px-2 py-0.5 rounded-md text-black font-extrabold text-sm">
                                        {dateRange?.to ? format(dateRange.to, "do MMM yyyy -  HH:mm") : "—"}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="flex gap-4 py-0 m-0 ">
                        {/* Calendar Section */}
                        <Calendar
                            mode="range"
                            defaultMonth={dateRange?.from}
                            numberOfMonths={1}
                            selected={dateRange}
                            onSelect={handleDateSelect}
                            disabled={{ after: new Date() }}
                            className="rounded-md border-none p-0 w-full flex-1 md:[--cell-size:--spacing(12)]"
                        />

                        {/* Time Section */}
                        <div className="flex flex-col gap-4 border-l pl-4 min-w-[160px] justify-start">
                            <FieldGroup className="gap-4">
                                <Field>
                                    <FieldLabel className="text-xs text-muted-foreground mb-1 block">From Time</FieldLabel>
                                    <CustomTimePicker
                                        date={dateRange.from}
                                        disabled={!dateRange.from}
                                        onChange={(d) => setDateRange(prev => ({ ...prev, from: d }))}
                                    />
                                </Field>

                                <Field>
                                    <FieldLabel className="text-xs text-muted-foreground mb-1 block">To Time</FieldLabel>
                                    <CustomTimePicker
                                        date={dateRange.to}
                                        disabled={!dateRange.to}
                                        onChange={(d) => setDateRange(prev => ({ ...prev, to: d }))}
                                    />
                                </Field>
                            </FieldGroup>
                        </div>
                    </CardContent>

                    {/* Action / Summary Footer */}
                    <CardFooter className="flex flex-col items-stretch gap-3 border-t m-0 bg-slate-50/50 px-4 py-3">


                        <div className="flex items-center gap-2 mt-2">
                            <Button
                                variant="outline"
                                className="w-1/3"
                                onClick={() => {
                                    setDateRange({ from: undefined, to: undefined });
                                    onApply({ from: null, to: null });
                                }}
                            >
                                Clear
                            </Button>
                            <Button className="w-2/3" onClick={() => onApply(dateRange)}>
                                Apply Filter
                            </Button>
                        </div>
                    </CardFooter>

                </Card>
            </PopoverContent>
        </Popover>
    );
}