import * as React from "react";

import { cn } from "@/lib/utils";
import { controlBase } from "./input";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(controlBase, "min-h-16 px-2.5 py-2 leading-5", className)} {...props} />;
}

export { Textarea };
