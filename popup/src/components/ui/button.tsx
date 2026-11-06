import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "cn"

const buttonVariants = cva(
  [
    "group/button inline-flex shrink-0 items-center justify-center rounded-none border border-transparent",
    "font-heading font-normal whitespace-nowrap select-none outline-none transition-colors",
    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none data-disabled:pointer-events-none",
    "aria-invalid:border-destructive",
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
  ],
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground hover:bg-primary-hover aria-expanded:bg-primary-hover",
          "disabled:bg-disabled disabled:text-disabled-foreground data-disabled:bg-disabled data-disabled:text-disabled-foreground",
        ],
        secondary: [
          "bg-secondary text-secondary-foreground hover:bg-secondary-hover aria-expanded:bg-secondary-hover",
          "disabled:bg-disabled disabled:text-disabled-foreground data-disabled:bg-disabled data-disabled:text-disabled-foreground",
        ],
        outline: [
          "border-[1.5px] border-foreground bg-transparent text-foreground hover:bg-accent aria-expanded:bg-accent",
          "disabled:border-border disabled:text-disabled-foreground data-disabled:border-border data-disabled:text-disabled-foreground",
        ],
        ghost: [
          "bg-transparent text-link hover:bg-accent aria-expanded:bg-accent",
          "disabled:text-disabled-foreground data-disabled:text-disabled-foreground",
        ],
        destructive: [
          "bg-destructive text-destructive-foreground hover:bg-destructive-hover focus-visible:ring-destructive",
          "disabled:bg-disabled disabled:text-disabled-foreground data-disabled:bg-disabled data-disabled:text-disabled-foreground",
        ],
        link: "h-auto px-0 text-link underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-7 gap-1.5 px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3",
        default: "h-8 gap-1.5 px-3 text-[13px]",
        lg: "h-10 gap-2 px-4 text-sm [&_svg:not([class*='size-'])]:size-4",
        "icon-sm": "size-7 [&_svg:not([class*='size-'])]:size-3",
        icon: "size-8",
        "icon-lg": "size-10 [&_svg:not([class*='size-'])]:size-4",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
