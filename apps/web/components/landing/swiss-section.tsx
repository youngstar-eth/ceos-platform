'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface SwissGridProps {
    children: React.ReactNode;
    className?: string;
    cols?: 1 | 2 | 3 | 4 | 6 | 12;
}

export function SwissGrid({ children, className, cols = 12 }: SwissGridProps) {
    return (
        <div
            className={cn(
                'grid gap-4 md:gap-8',
                cols === 12 && 'grid-cols-1 md:grid-cols-12',
                cols === 6 && 'grid-cols-1 md:grid-cols-6',
                cols === 4 && 'grid-cols-1 md:grid-cols-4',
                cols === 3 && 'grid-cols-1 md:grid-cols-3',
                cols === 2 && 'grid-cols-1 md:grid-cols-2',
                cols === 1 && 'grid-cols-1',
                className
            )}
        >
            {children}
        </div>
    );
}

interface SwissSectionProps {
    children: React.ReactNode;
    className?: string;
    grid?: boolean;
}

export function SwissSection({
    children,
    className,
    grid = true,
}: SwissSectionProps) {
    return (
        <section className={cn('relative w-full py-24 md:py-32', className)}>
            {/* Background Grid Lines */}
            {grid && (
                <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
                    <div
                        className="w-full h-full"
                        style={{
                            backgroundImage:
                                'linear-gradient(90deg, #fff 1px, transparent 1px), linear-gradient(#fff 1px, transparent 1px)',
                            backgroundSize: '100px 100px',
                        }}
                    />
                </div>
            )}
            <div className="mx-auto max-w-7xl px-6 relative z-10">{children}</div>
        </section>
    );
}

interface SwissTypeProps {
    children: React.ReactNode;
    as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
    variant?: 'display' | 'title' | 'body' | 'label';
    className?: string;
    emboss?: boolean;
}

export function SwissType({
    children,
    as: Component = 'p',
    variant = 'body',
    className,
    emboss = false,
}: SwissTypeProps) {
    const styles = {
        display: 'text-6xl md:text-8xl font-black tracking-tighter leading-[0.85]',
        title: 'text-3xl md:text-5xl font-bold tracking-tight',
        body: 'text-base md:text-lg font-medium leading-relaxed',
        label: 'text-xs uppercase tracking-[0.2em] font-bold',
    };

    return (
        <Component
            className={cn(
                'font-inter', // Assuming Inter is available or similar sans-serif
                styles[variant],
                emboss && 'text-transparent bg-clip-text bg-gradient-to-br from-white to-white/50 drop-shadow-sm',
                // Simple CSS emboss effect using text-shadow if bg-clip isn't enough
                emboss && '[text-shadow:0px_2px_3px_rgba(0,0,0,0.5)]',
                className
            )}
        >
            {children}
        </Component>
    );
}
