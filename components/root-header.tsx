import { AnimatedTitle } from "@/components/animated-title";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

const links = [
  { href: "https://www.linkedin.com/in/charlotte-zhuang", label: "linkedin" },
  { href: "https://github.com/charlotte-zhuang", label: "github" },
  { href: "https://www.instagram.com/charlottechipcookie", label: "instagram" },
];

export default function RootHeader() {
  return (
    <header className="mx-auto px-8 py-4 flex max-w-4xl flex-col gap-2 sm:flex-row sm:justify-between">
      <AnimatedTitle />

      <NavigationMenu>
        <NavigationMenuList className="gap-1 -ml-2">
          {links.map((link) => (
            <NavigationMenuItem key={link.href}>
              <NavigationMenuLink href={link.href} target="_blank" rel="noopener noreferrer">
                {link.label}
              </NavigationMenuLink>
            </NavigationMenuItem>
          ))}
        </NavigationMenuList>
      </NavigationMenu>
    </header>
  );
}
