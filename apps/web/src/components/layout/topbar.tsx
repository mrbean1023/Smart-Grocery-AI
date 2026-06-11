"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { CreditCard, Crown, Leaf, LogOut, Menu, Moon, Sun, User } from "lucide-react";

import { NAV_ITEMS, isActive, pageTitle } from "@/components/layout/nav";
import { NotificationsPopover } from "@/components/layout/notifications-popover";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useTheme } from "@/components/theme-toggle";
import { clearTokenCache } from "@/lib/api";
import { initials } from "@/lib/format";
import { useUpgradePrompt } from "@/stores/upgrade-store";
import { cn } from "@/lib/utils";

export function Topbar() {
  const pathname = usePathname();
  const router = useRouter();
  const { data: session } = useSession();
  const { theme, toggle } = useTheme();
  const showUpgrade = useUpgradePrompt((s) => s.show);
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  const user = session?.user;
  const isFree = user?.tier !== "PREMIUM";

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 border-b glass px-4 sm:px-6">
      {/* Mobile nav drawer */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="md:hidden" aria-label="Open navigation">
            <Menu className="h-5 w-5" aria-hidden />
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-72 p-0">
          <SheetTitle className="sr-only">Navigation</SheetTitle>
          <div className="flex h-16 items-center gap-2 border-b px-4 font-semibold">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Leaf className="h-4 w-4" aria-hidden />
            </span>
            Smart Grocery
          </div>
          <nav className="space-y-1 p-2" aria-label="Primary">
            {NAV_ITEMS.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setDrawerOpen(false)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-primary/10 text-primary"
                      : "text-foreground/80 hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  <item.icon className="h-4.5 w-4.5" aria-hidden />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </SheetContent>
      </Sheet>

      <h1 className="truncate text-lg font-semibold tracking-tight">{pageTitle(pathname)}</h1>

      <div className="ml-auto flex items-center gap-1.5">
        {user &&
          (isFree ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => showUpgrade()}
              className="hidden border-amber-300 text-amber-700 hover:bg-amber-50 hover:text-amber-800 dark:border-amber-700 dark:text-amber-400 dark:hover:bg-amber-950 sm:inline-flex"
            >
              <Crown className="h-3.5 w-3.5" aria-hidden /> Upgrade
            </Button>
          ) : (
            <Badge variant="warning" className="hidden sm:inline-flex">
              <Crown aria-hidden /> Premium
            </Badge>
          ))}

        <NotificationsPopover />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account menu">
              <Avatar className="h-8 w-8">
                {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                <AvatarFallback>{user?.name ? initials(user.name) : "?"}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <p className="truncate text-sm font-medium">{user?.name}</p>
              <p className="truncate text-xs font-normal text-muted-foreground">{user?.email}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => router.push("/settings")}>
              <User aria-hidden /> Profile
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push("/settings?tab=billing")}>
              <CreditCard aria-hidden /> Billing
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggle();
              }}
            >
              {theme === "dark" ? <Sun aria-hidden /> : <Moon aria-hidden />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => {
                clearTokenCache();
                void signOut({ callbackUrl: "/login" });
              }}
              className="text-destructive focus:text-destructive"
            >
              <LogOut aria-hidden /> Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
