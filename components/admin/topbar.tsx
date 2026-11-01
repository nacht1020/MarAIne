"use client";

import { useEffect, useRef } from "react";
import { Database, LogOut, Menu, Search } from "lucide-react";
import { signOut } from "@/app/auth/actions";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

type TopbarProps = {
  user: { name: string; email: string; municipality: string | null };
  onOpenMenu: () => void;
};

export function Topbar({ user, onOpenMenu }: TopbarProps) {
  const searchRef = useRef<HTMLInputElement>(null);

  // "/" focuses search, as in most data tools.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement;
      if (event.key !== "/" || target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b bg-background/95 px-4 backdrop-blur-sm supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <Button variant="ghost" size="icon" className="lg:hidden" onClick={onOpenMenu} aria-label="Open navigation">
        <Menu className="size-4" />
      </Button>

      <form action="/admin/catches" role="search" className="relative w-full max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor="global-search" className="sr-only">
          Search catches
        </label>
        <Input
          ref={searchRef}
          id="global-search"
          name="q"
          type="search"
          placeholder="Search fisher or species"
          className="h-9 pl-8 pr-8"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 rounded border bg-muted px-1.5 font-mono text-[10px] text-muted-foreground sm:block">
          /
        </kbd>
      </form>

      <div className="ml-auto flex items-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="mr-1 hidden items-center gap-1.5 rounded-md bg-sand px-2 py-1 text-xs font-medium text-sand-foreground md:inline-flex">
              <Database className="size-3.5" aria-hidden />
              Sample data
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-64">
            Figures come from seeded SAMPLE DATA for demonstration. They are not real records.
          </TooltipContent>
        </Tooltip>

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="size-8">
                <AvatarFallback className="bg-navy text-xs font-medium text-navy-foreground">{initials(user.name)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="font-normal">
              <p className="truncate text-sm font-medium">{user.name}</p>
              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Admin{user.municipality ? ` · ${user.municipality}` : ""}
              </p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <form action={signOut}>
              <DropdownMenuItem asChild>
                <button type="submit" className="w-full">
                  <LogOut className="mr-2 size-4" /> Sign out
                </button>
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "A";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}
