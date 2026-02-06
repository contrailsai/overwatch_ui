import * as React from "react"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

const Checkbox = React.forwardRef(({ className, checked, defaultChecked, onCheckedChange, ...props }, ref) => {
  const [internalChecked, setInternalChecked] = React.useState(defaultChecked || false)

  // Sync with controlled 'checked' prop if provided
  const isChecked = checked !== undefined ? checked : internalChecked

  const handleChange = (e) => {
    const newChecked = !isChecked
    if (checked === undefined) {
      setInternalChecked(newChecked)
    }
    if (onCheckedChange) {
      onCheckedChange(newChecked)
    }
  }

  return (
    <div
      className={cn(
        "peer h-5 w-5 shrink-0 rounded border-2 border-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50 transition-colors cursor-pointer flex items-center justify-center",
        isChecked ? "bg-blue-600 border-blue-600 text-white" : "bg-white hover:border-blue-400",
        className
      )}
      onClick={handleChange}
    >
      {isChecked && <Check className="h-3.5 w-3.5 stroke-[3px]" />}
      <input
        type="checkbox"
        className="hidden"
        ref={ref}
        checked={isChecked}
        onChange={() => { }} // Handled by div click
        {...props}
      />
    </div>
  )
})
Checkbox.displayName = "Checkbox"

export { Checkbox }