import { useState } from 'react';
import { format, subDays } from 'date-fns';
import { CalendarIcon, Clock2Icon } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardAction, CardFooter } from '@/components/ui/card'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field"
import {
    InputGroup,
    InputGroupAddon,
    InputGroupInput,
} from "@/components/ui/input-group"

// import { format, addDays, addHours, addMinutes, subDays, formatDate } from "date-fns"
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button';

export function DateFilterPopover({ title, onApply, initialFrom, initialTo }) {
    const [dateRange, setDateRange] = useState({
        from: initialFrom ? new Date(initialFrom) : undefined,
        to: initialTo ? new Date(initialTo) : undefined,
    });

    // Helper to extract HH:mm:ss for the input values
    const getTimeString = (date) => {
        if (!date) return "00:00:00";
        return format(date, "HH:mm:ss");
    };

    // Updates the time portion of the date state
    const handleTimeChange = (type, e) => {
        const timeValue = e.target.value;
        if (!timeValue || !dateRange?.[type]) return;

        const [hours, minutes, seconds] = timeValue.split(':').map(Number);
        const updatedDate = new Date(dateRange[type]);
        updatedDate.setHours(hours || 0, minutes || 0, seconds || 0);

        setDateRange((prev) => ({ ...prev, [type]: updatedDate }));
    };

    // Intercept calendar selection to preserve the currently selected times
    const handleDateSelect = (newRange) => {
        if (!newRange) {
            setDateRange({ from: undefined, to: undefined });
            return;
        }

        const updatedRange = { ...newRange };

        if (updatedRange.from && dateRange.from) {
            updatedRange.from.setHours(
                dateRange.from.getHours(),
                dateRange.from.getMinutes(),
                dateRange.from.getSeconds()
            );
        }

        if (updatedRange.to && dateRange.to) {
            updatedRange.to.setHours(
                dateRange.to.getHours(),
                dateRange.to.getMinutes(),
                dateRange.to.getSeconds()
            );
        }

        setDateRange(updatedRange);
    };

    return (

        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start text-left font-normal bg-white border-slate-200 h-9 text-xs">
                    <CalendarIcon className=" h-3.5 w-3.5" />
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

                    <CardHeader className="border pt-4 px-4 ">
                        <CardTitle className="text-sm font-semibold">Select Dates Range</CardTitle>
                    </CardHeader>

                    <CardContent className="flex gap-4 py-0">
                        {/* Calendar Section */}
                        <Calendar
                            mode="range"
                            defaultMonth={dateRange?.from}
                            numberOfMonths={1}
                            selected={dateRange}
                            onSelect={handleDateSelect}
                            disabled={{ after: new Date() }}
                            className="rounded-md border-none p-0"
                        />

                        {/* Time Section */}
                        <div className="flex flex-col gap-2 border-l pl-4 min-w-[200px] justify-center">
                            <FieldGroup>
                                <Field>
                                    <FieldLabel htmlFor="time-from" className="text-xs text-muted-foreground">From Time</FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            id="time-from"
                                            type="time"
                                            step="1"
                                            value={getTimeString(dateRange?.from)}
                                            onChange={(e) => handleTimeChange('from', e)}
                                            disabled={!dateRange?.from}
                                            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                        />
                                        <InputGroupAddon>
                                            <Clock2Icon className="h-4 w-4 text-muted-foreground" />
                                        </InputGroupAddon>
                                    </InputGroup>
                                </Field>

                                <Field>
                                    <FieldLabel htmlFor="time-to" className="text-xs text-muted-foreground">To Time</FieldLabel>
                                    <InputGroup>
                                        <InputGroupInput
                                            id="time-to"
                                            type="time"
                                            step="1"
                                            value={getTimeString(dateRange?.to)}
                                            onChange={(e) => handleTimeChange('to', e)}
                                            disabled={!dateRange?.to}
                                            className="appearance-none [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
                                        />
                                        <InputGroupAddon>
                                            <Clock2Icon className="h-4 w-4 text-muted-foreground" />
                                        </InputGroupAddon>
                                    </InputGroup>
                                </Field>
                            </FieldGroup>
                        </div>
                    </CardContent>

                    {/* Action / Summary Footer */}
                    <CardFooter className="flex flex-col items-stretch gap-3 border-t bg-slate-50/50 px-4 py-3">
                        <div className="flex flex-col gap-1 text-sm">
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-500">From:</span>
                                <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono text-xs">
                                    {dateRange?.from ? format(dateRange.from, "dd-MM-yyyy HH:mm:ss a") : "—"}
                                </span>
                            </div>
                            <div className="flex justify-between items-center">
                                <span className="font-medium text-slate-500">To:</span>
                                <span className="px-2 py-0.5 bg-slate-100 rounded-md font-mono text-xs">
                                    {dateRange?.to ? format(dateRange.to, "dd-MM-yyyy HH:mm:ss a") : "—"}
                                </span>
                            </div>
                        </div>

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