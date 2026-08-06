"use client";

import { motion, Variants } from "framer-motion";
import React, {
  ElementType,
  ReactNode,
  useEffect,
  useState,
} from "react";
import { cn } from "@/components/lib/utils";

export interface TypingTextProps {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  delay?: number;
  duration?: number;
  fontSize?: string;
  fontWeight?: string;
  color?: string;
  letterSpacing?: string;
  align?: "left" | "center" | "right";
  loop?: boolean;
}

export const TypingText = ({
  children,
  as: Component = "div",
  className = "",
  delay = 0,
  duration = 2,
  fontSize = "text-4xl",
  fontWeight = "font-bold",
  color = "text-white",
  letterSpacing = "tracking-wide",
  align = "left",
  loop = false,
}: TypingTextProps) => {
  const [textContent, setTextContent] = useState<string>("");
  // The upstream component declares `loop` but never implements it: remount
  // the character spans each cycle so the reveal starts over.
  const [cycle, setCycle] = useState(0);

  useEffect(() => {
    const extractText = (node: ReactNode): string => {
      if (typeof node === "string" || typeof node === "number") {
        return node.toString();
      }
      if (Array.isArray(node)) {
        return node.map(extractText).join("");
      }
      if (React.isValidElement(node)) {
        const element = node as React.ReactElement<any>;
        if (typeof element.props.children !== "undefined") {
          return extractText(element.props.children);
        }
      }
      return "";
    };

    setTextContent(extractText(children));
  }, [children]);

  useEffect(() => {
    if (!loop || !textContent) return;
    // typing window + the last char's 0.3s fade + a hold before restarting
    const totalMs = (delay + duration + 0.3 + 1.2) * 1000;
    const timer = setTimeout(() => setCycle((c) => c + 1), totalMs);
    return () => clearTimeout(timer);
  }, [loop, cycle, textContent, delay, duration]);

  const characters = textContent.split("").map((char) =>
    char === " " ? " " : char
  );

  // Long, overlapping per-character fades (rise + blur-in) read as one smooth
  // wave; the upstream 0.3s pop-in looks steppy at small sizes.
  const characterVariants: Variants = {
    hidden: { opacity: 0, y: 4, filter: "blur(4px)" },
    visible: (i: number) => ({
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      transition: {
        delay: delay + i * (duration / characters.length),
        duration: 0.55,
        ease: "easeOut",
      },
    }),
  };

  return React.createElement(
    Component as any,
    {
      className: cn(
        "inline-flex",
        className,
        fontSize,
        fontWeight,
        color,
        letterSpacing,
        align === "center"
          ? "justify-center text-center"
          : align === "right"
          ? "justify-end text-right"
          : "justify-start text-left"
      ),
    },
    <motion.span
      key={cycle}
      className="inline-block"
      initial="hidden"
      animate="visible"
      aria-label={textContent}
      role="text"
    >
      {characters.map((char, index) => (
        <motion.span
          key={`${char}-${index}`}
          className="inline-block"
          variants={characterVariants}
          custom={index}
          initial="hidden"
          animate="visible"
        >
          {char}
        </motion.span>
      ))}
    </motion.span>
  );
};
