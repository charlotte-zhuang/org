import { AnimatedTitle } from "@/components/animated-title";
import {
  NavigationMenu,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
} from "@/components/ui/navigation-menu";

const links = [
  { href: "https://www.linkedin.com/in/charlotte-zhuang", label: "LinkedIn" },
  { href: "https://github.com/charlotte-zhuang", label: "GitHub" },
  { href: "https://www.instagram.com/charlottechipcookie", label: "Instagram" },
];

export default function RootHeader() {
  return (
    <header className="flex justify-center p-4">
      <div className="flex w-full max-w-4xl flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <AnimatedTitle />

        <NavigationMenu>
          <NavigationMenuList className="gap-1">
            {links.map((link) => (
              <NavigationMenuItem key={link.href}>
                <NavigationMenuLink href={link.href} target="_blank" rel="noopener noreferrer">
                  {link.label}
                </NavigationMenuLink>
              </NavigationMenuItem>
            ))}
          </NavigationMenuList>
        </NavigationMenu>
      </div>
    </header>
  );
}
