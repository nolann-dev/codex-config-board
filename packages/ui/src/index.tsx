import type { ComponentProps, HTMLAttributes, PropsWithChildren, ReactNode } from "react";
import {
  Badge as RadixBadge,
  Box,
  Button as RadixButton,
  Card,
  Code,
  Flex,
  Heading,
  Link,
  Text,
} from "@radix-ui/themes";
import { clsx } from "clsx";

type BadgeProps = PropsWithChildren<
  Omit<ComponentProps<typeof RadixBadge>, "color" | "variant"> & { tone?: "neutral" | "success" | "warning" | "danger" }
>;

export function Button({ className, ...props }: ComponentProps<typeof RadixButton>) {
  return <RadixButton className={clsx("ccb-button", className)} radius="small" {...props} />;
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return (
    <Card asChild className={clsx("ccb-panel", className)}>
      <section {...props} />
    </Card>
  );
}

export function Panel({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <Surface className={className} {...props} />;
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: BadgeProps) {
  const color: ComponentProps<typeof RadixBadge>["color"] =
    tone === "success" ? "green" : tone === "warning" ? "orange" : tone === "danger" ? "red" : "gray";
  return <RadixBadge className={clsx("ccb-badge", `ccb-badge-${tone}`, className)} color={color} variant="soft" {...props} />;
}

export function SectionTitle({ className, ...props }: ComponentProps<typeof Heading>) {
  return <Heading as="h2" className={clsx("panel-title", className)} size="3" {...props} />;
}

export function MutedText({ className, ...props }: ComponentProps<typeof Text>) {
  return <Text as="span" className={clsx("muted", className)} color="gray" {...props} />;
}

export function InlineCode({ className, ...props }: ComponentProps<typeof Code>) {
  return <Code className={clsx("code", className)} variant="ghost" {...props} />;
}

export function Toolbar({ className, ...props }: ComponentProps<typeof Flex>) {
  return <Flex align="center" className={clsx("toolbar", className)} gap="2" wrap="wrap" {...props} />;
}

export function TextLink({ className, ...props }: ComponentProps<typeof Link>) {
  return <Link className={clsx("ccb-link", className)} underline="none" {...props} />;
}

export function PageHeader({
  action,
  className,
  description,
  title,
}: {
  action?: ReactNode;
  className?: string;
  description?: string;
  title: string;
}) {
  return (
    <Flex align="start" className={clsx("page-header", className)} gap="4" justify="between" wrap="wrap">
      <Box>
        <Heading as="h1" className="page-title" size="6">
          {title}
        </Heading>
        {description ? <MutedText>{description}</MutedText> : null}
      </Box>
      {action}
    </Flex>
  );
}
