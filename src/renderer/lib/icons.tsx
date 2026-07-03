import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CopyIcon,
  Cross2Icon,
  CubeIcon,
  DesktopIcon,
  DoubleArrowDownIcon,
  DoubleArrowUpIcon,
  DownloadIcon,
  ExternalLinkIcon,
  EyeOpenIcon,
  GlobeIcon,
  LayersIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  MoonIcon,
  PauseIcon,
  PlayIcon,
  ReloadIcon,
  SunIcon,
  TargetIcon,
  UpdateIcon,
} from "@radix-ui/react-icons";
import type { JSX } from "react";

type IconProps = { size?: number; className?: string };

// Thin wrappers around @radix-ui/react-icons that preserve our { size, className }
// API so call sites (and their per-use `size` overrides) stay unchanged.

export function PauseBars({ size = 11, className }: IconProps): JSX.Element {
  return <PauseIcon width={size} height={size} className={className} aria-hidden />;
}

export function PlayTriangle({ size = 11, className }: IconProps): JSX.Element {
  return <PlayIcon width={size} height={size} className={className} aria-hidden />;
}

export function Search({ size = 14, className }: IconProps): JSX.Element {
  return <MagnifyingGlassIcon width={size} height={size} className={className} aria-hidden />;
}

export function ClearX({ size = 13, className }: IconProps): JSX.Element {
  return <Cross2Icon width={size} height={size} className={className} aria-hidden />;
}

export function Refresh({ size = 15, className }: IconProps): JSX.Element {
  return <ReloadIcon width={size} height={size} className={className} aria-hidden />;
}

export function ViewOptions({ size = 15, className }: IconProps): JSX.Element {
  return <MixerHorizontalIcon width={size} height={size} className={className} aria-hidden />;
}

export function Check({ size = 13, className }: IconProps): JSX.Element {
  return <CheckIcon width={size} height={size} className={className} aria-hidden />;
}

export function Sun({ size = 15, className }: IconProps): JSX.Element {
  return <SunIcon width={size} height={size} className={className} aria-hidden />;
}

export function Moon({ size = 15, className }: IconProps): JSX.Element {
  return <MoonIcon width={size} height={size} className={className} aria-hidden />;
}

export function Download({ size = 13, className }: IconProps): JSX.Element {
  return <DownloadIcon width={size} height={size} className={className} aria-hidden />;
}

export function ModeService({ size = 16, className }: IconProps): JSX.Element {
  return <LayersIcon width={size} height={size} className={className} aria-hidden />;
}

export function ModeHost({ size = 16, className }: IconProps): JSX.Element {
  return <DesktopIcon width={size} height={size} className={className} aria-hidden />;
}

export function ModeIp({ size = 16, className }: IconProps): JSX.Element {
  return <GlobeIcon width={size} height={size} className={className} aria-hidden />;
}

export function ModeAll({ size = 16, className }: IconProps): JSX.Element {
  return <ListBulletIcon width={size} height={size} className={className} aria-hidden />;
}

export function ExpandAll({ size = 14, className }: IconProps): JSX.Element {
  return <DoubleArrowDownIcon width={size} height={size} className={className} aria-hidden />;
}

export function CollapseAll({ size = 14, className }: IconProps): JSX.Element {
  return <DoubleArrowUpIcon width={size} height={size} className={className} aria-hidden />;
}

export function DisclosureDown({ size = 11, className }: IconProps): JSX.Element {
  return <ChevronDownIcon width={size} height={size} className={className} aria-hidden />;
}

export function DisclosureRight({ size = 11, className }: IconProps): JSX.Element {
  return <ChevronRightIcon width={size} height={size} className={className} aria-hidden />;
}

export function Copy({ size = 13, className }: IconProps): JSX.Element {
  return <CopyIcon width={size} height={size} className={className} aria-hidden />;
}

export function ModeInstance({ size = 16, className }: IconProps): JSX.Element {
  return <CubeIcon width={size} height={size} className={className} aria-hidden />;
}

export function ChevronRight({ size = 12, className }: IconProps): JSX.Element {
  return <ChevronRightIcon width={size} height={size} className={className} aria-hidden />;
}

export function Radar({ size = 40, className }: IconProps): JSX.Element {
  return <TargetIcon width={size} height={size} className={className} aria-hidden />;
}

export function ToastCheck({ size = 14, className }: IconProps): JSX.Element {
  return <CheckIcon width={size} height={size} className={className} aria-hidden />;
}

export function ExtLink({ size = 13, className }: IconProps): JSX.Element {
  return <ExternalLinkIcon width={size} height={size} className={className} aria-hidden />;
}

export function RevealHost({ size = 13, className }: IconProps): JSX.Element {
  return <EyeOpenIcon width={size} height={size} className={className} aria-hidden />;
}

export function Resolve({ size = 13, className }: IconProps): JSX.Element {
  return <UpdateIcon width={size} height={size} className={className} aria-hidden />;
}
