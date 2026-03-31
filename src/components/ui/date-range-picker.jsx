"use client"

import * as React from "react"
import { addDays, format, formatRelative, subDays, formatDistance } from "date-fns"
import { Calendar as CalendarIcon, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export function DatePickerWithRange({
  className,
  date,
  setDate,
  placeholder = "Pick a date range",
  trigger,
  open: externalOpen,
  onOpenChange: externalOnOpenChange,
}) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;
  const setIsOpen = externalOnOpenChange !== undefined ? externalOnOpenChange : setInternalOpen;

  const handleSelect = (newDate) => {
    setDate(newDate);
    if (newDate?.from && newDate?.to) {
      setIsOpen(false);
    }
  };

  return (
    <div className={cn("grid gap-2 p-0", className)}>
      <Popover open={isOpen} onOpenChange={setIsOpen}>
        <PopoverTrigger asChild>
          {trigger ? trigger : (
            <Button
              id="date"
              variant={"outline"}
              className={cn(
                "w-full justify-start text-left font-normal bg-white border-slate-200 hover:bg-slate-50 hover:text-slate-900 transition-colors shadow-sm",
                !date && "text-muted-foreground",
                className
              )}
            >
              <CalendarIcon className="mr-2 h-4 w-4 text-slate-500" />
              {date?.from ? (
                date.to ? (
                  <>
                    {format(date.from, "LLL dd, y")} -{" "}
                    {format(date.to, "LLL dd, y")} 
                    &nbsp; &nbsp;
                    ({ formatDistance(date.to, date.from) })
                  </>
                ) : (
                  <>
                     {format(date.from, "LLL dd, y")} - Today
                  </>
                )
              ) : (
                <span className="text-slate-500">{placeholder}</span>
              )}
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={handleSelect}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
          />
        </PopoverContent>
      </Popover>
    </div>
  )
}