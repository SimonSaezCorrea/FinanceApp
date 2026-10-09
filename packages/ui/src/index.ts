// Cuadra's design system. Consumers import components by path (`@finance/ui/src/shared/ui/…`) so
// each app's chunks only carry what a page uses; this barrel names the most shared pieces.
export { cn } from "./shared/lib/cn";
export { useMediaQuery } from "./shared/lib/useMediaQuery";
export { formatRutInput } from "./shared/lib/formatRut";
export { Button } from "./shared/ui/button";
export { buttonClasses } from "./shared/ui/button-classes";
export { BrandMark } from "./shared/ui/brand-mark";
export { AppSplash } from "./shared/ui/app-splash";
export { ThemeSegmented } from "./shared/ui/theme-segmented";
export { ThemeProvider } from "./theme/ThemeProvider";
export { useTheme, THEME_STORAGE_KEY } from "./theme/useTheme";
