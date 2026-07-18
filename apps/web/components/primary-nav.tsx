"use client";

import { usePathname } from "next/navigation";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

export function PrimaryNav() {
  const pathname = usePathname();
  const leaderboardActive = pathname.startsWith("/leaderboard");
  const playActive = !leaderboardActive;

  return (
    <NavigationMenu aria-label="Primary navigation">
      <NavigationMenuList className="rounded-xl border bg-card/70 p-1 shadow-sm">
        <NavigationMenuItem>
          <NavigationMenuLink data-active={playActive || undefined} href="/#games">
            Play
          </NavigationMenuLink>
        </NavigationMenuItem>
        <NavigationMenuItem>
          <NavigationMenuLink data-active={leaderboardActive || undefined} href="/leaderboard/wordle">
            Leaderboard
          </NavigationMenuLink>
        </NavigationMenuItem>
      </NavigationMenuList>
    </NavigationMenu>
  );
}
