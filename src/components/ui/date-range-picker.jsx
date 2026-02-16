"use client"

import * as React from "react"
import { addDays, format } from "date-fns"
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
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
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
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="range"
            defaultMonth={date?.from}
            selected={date}
            onSelect={setDate}
            numberOfMonths={2}
            disabled={(date) => date > new Date()}
          />
        </PopoverContent>
      </Popover>
      {date?.from && (
        <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
                e.stopPropagation();
                setDate(undefined);
            }}
            className="absolute right-2 top-2 h-6 w-6 p-0 hover:bg-slate-100 rounded-full"
        >
            <X className="h-3 w-3 text-slate-500" />
        </Button>
      )}
    </div>
  )
}