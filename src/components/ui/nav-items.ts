import { Compass, Heart, UserRound, UsersRound, type LucideIcon } from "lucide-react";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
};

export const navItems: NavItem[] = [
  { label: "Discover", href: "/discover", icon: Compass },
  { label: "Collection", href: "/collection", icon: Heart },
  { label: "Friends", href: "/friends", icon: UsersRound },
  { label: "Profile", href: "/profile", icon: UserRound },
];
