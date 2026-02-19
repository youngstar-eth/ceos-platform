'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Loader2,
  Copy,
  Check,
  AlertTriangle,
  Zap,
  Star,
} from 'lucide-react';
import { formatUsdcPrice, cn } from '@/lib/utils';
import { CATEGORY_STYLES } from '@/components/services/service-card';
import { useMyAgents, type Agent } from '@/hooks/use-agent';
import { useCreateServiceJob, type ServiceOffering } from '@/hooks/use-services';

interface HireAgentSheetProps {
  offering: ServiceOffering | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  walletAddress: string | undefined;
}

/**
 * Full offering detail from GET /api/services/[slug] — includes inputSchema.
 */
interface OfferingDetail {
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

export function HireAgentSheet({
  offering,
  open,
  onOpenChange,
  walletAddress,
}: HireAgentSheetProps) {
  // ── State ────────────────────────────────────────────────────────────

  const [buyerAgentId, setBuyerAgentId] = useState('');
  const [requirements, setRequirements] = useState('{\n  \n}');
  const [ttlMinutes, setTtlMinutes] = useState('30');
  const [offeringDetail, setOfferingDetail] = useState<OfferingDetail | null>(null);
  const [templateCopied, setTemplateCopied] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Data Fetching ────────────────────────────────────────────────────

  const { data: agentsResponse } = useMyAgents(walletAddress, 1, 50);
  const activeAgents =
    agentsResponse?.data?.filter(
      (a: Agent) => a.status.toUpperCase() === 'ACTIVE',
    ) ?? [];

  const createJob = useCreateServiceJob(walletAddress);

  // Fetch full offering detail (includes inputSchema) when Sheet opens
  useEffect(() => {
    if (!offering || !open) {
      setOfferingDetail(null);
      return;
    }

    let cancelled = false;
    fetch(`/api/services/${offering.slug}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled && data) {
          setOfferingDetail(data as OfferingDetail);
        }
      })
      .catch(() => {
        /* non-critical — inputSchema guidance just won't render */
      });

    return () => {
      cancelled = true;
    };
  }, [offering, open]);

  // Reset state on close
  useEffect(() => {
    if (!open) {
      setBuyerAgentId('');
      setRequirements('{\n  \n}');
      setTtlMinutes('30');
      setTemplateCopied(false);
      setSubmitError(null);
    }
  }, [open]);

  // ── Handlers ─────────────────────────────────────────────────────────

  const handleCopyTemplate = useCallback(() => {
    if (!offeringDetail?.inputSchema) return;

    const template = generateTemplate(offeringDetail.inputSchema);
    setRequirements(JSON.stringify(template, null, 2));
    setTemplateCopied(true);
    setTimeout(() => setTemplateCopied(false), 2000);
  }, [offeringDetail]);

  const handleSubmit = useCallback(async () => {
    if (!offering || !buyerAgentId) return;
    setSubmitError(null);

    try {
      const parsedReqs = JSON.parse(requirements) as Record<string, unknown>;
      await createJob.mutateAsync({
        buyerAgentId,
        offeringSlug: offering.slug,
        requirements: parsedReqs,
        ttlMinutes: Number(ttlMinutes) || 30,
      });
      onOpenChange(false);
    } catch (err) {
      if (err instanceof SyntaxError) {
        setSubmitError('Invalid JSON in requirements field');
      } else {
        setSubmitError(
          err instanceof Error ? err.message : 'Failed to create job',
        );
      }
    }
  }, [offering, buyerAgentId, requirements, ttlMinutes, createJob, onOpenChange]);

  if (!offering) return null;

  const categoryStyle = CATEGORY_STYLES[offering.category] ?? CATEGORY_STYLES.content;
  const priceNum = Number(offering.priceUsdc) / 1_000_000;
  const protocolFee = priceNum * 0.02;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg bg-cp-void border-l border-cp-cyan/20 overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="font-orbitron text-cp-cyan text-lg">
            Hire Agent
          </SheetTitle>
          <SheetDescription className="font-share-tech text-white/50">
            Commission a service from the agent marketplace.
          </SheetDescription>
        </SheetHeader>

        {/* ── Service Summary ─────────────────────────────────── */}
        <div className="cp-glass rounded-lg p-4 mb-6 border border-cp-cyan/10">
          <div className="flex items-center justify-between mb-2">
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-orbitron uppercase tracking-widest border-0',
                categoryStyle.bg,
                categoryStyle.text,
              )}
            >
              {categoryStyle.label}
            </Badge>
            <span className="text-cp-acid font-orbitron font-bold text-sm">
              {formatUsdcPrice(offering.priceUsdc)}
            </span>
          </div>
          <h4 className="font-orbitron text-white text-sm font-bold mb-1">
            {offering.name}
          </h4>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="font-share-tech">
              @{offering.sellerAgent.name}
            </span>
            <span>·</span>
            <div className="flex items-center gap-1">
              <Star className="h-3 w-3 text-amber-400 fill-amber-400" />
              <span>{offering.avgRating?.toFixed(1) ?? '—'}</span>
            </div>
            <span>·</span>
            <div className="flex items-center gap-1">
              <Zap className="h-3 w-3 text-cp-acid/70" />
              <span>{offering.completedJobs} jobs</span>
            </div>
          </div>
        </div>

        {/* ── Buyer Agent Select ──────────────────────────────── */}
        <div className="space-y-2 mb-5">
          <label className="text-xs font-orbitron uppercase tracking-widest text-white/60">
            Buyer Agent
          </label>
          {activeAgents.length === 0 ? (
            <p className="text-xs font-share-tech text-cp-pink/80">
              No active agents found. Deploy and activate an agent first.
            </p>
          ) : (
            <Select value={buyerAgentId} onValueChange={setBuyerAgentId}>
              <SelectTrigger className="bg-cp-void/50 border-cp-cyan/20 text-white font-share-tech">
                <SelectValue placeholder="Select your agent..." />
              </SelectTrigger>
              <SelectContent className="bg-cp-void border-cp-cyan/20">
                {activeAgents.map((agent: Agent) => (
                  <SelectItem
                    key={agent.id}
                    value={agent.id}
                    className="text-white/70 font-share-tech focus:bg-cp-cyan/10 focus:text-cp-cyan"
                  >
                    {agent.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* ── Requirements JSON ───────────────────────────────── */}
        <div className="space-y-2 mb-5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-orbitron uppercase tracking-widest text-white/60">
              Requirements
            </label>
            {offeringDetail?.inputSchema && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-share-tech text-cp-cyan/70 hover:text-cp-cyan hover:bg-cp-cyan/10"
                onClick={handleCopyTemplate}
              >
                {templateCopied ? (
                  <>
                    <Check className="h-3 w-3 mr-1" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="h-3 w-3 mr-1" />
                    Copy Example Template
                  </>
                )}
              </Button>
            )}
          </div>
          <Textarea
            value={requirements}
            onChange={(e) => setRequirements(e.target.value)}
            placeholder='{ "topic": "DeFi trends", "format": "thread" }'
            rows={6}
            className="bg-cp-void/50 border-cp-cyan/20 text-white font-mono text-xs placeholder:text-white/20"
          />
          {offeringDetail?.inputSchema && (
            <p className="text-[10px] font-share-tech text-white/30">
              This service expects a JSON object matching the input schema.
              Click &quot;Copy Example Template&quot; to pre-fill.
            </p>
          )}
        </div>

        {/* ── TTL Input ──────────────────────────────────────── */}
        <div className="space-y-2 mb-6">
          <label className="text-xs font-orbitron uppercase tracking-widest text-white/60">
            Time Limit (minutes)
          </label>
          <Input
            type="number"
            min="1"
            max="1440"
            value={ttlMinutes}
            onChange={(e) => setTtlMinutes(e.target.value)}
            className="bg-cp-void/50 border-cp-cyan/20 text-white font-share-tech w-32"
          />
          <p className="text-[10px] font-share-tech text-white/30">
            Job expires after this duration. Min 1 min, max 24 hours.
          </p>
        </div>

        {/* ── Price Breakdown ────────────────────────────────── */}
        <div className="cp-glass rounded-lg p-4 mb-6 border border-cp-cyan/10 space-y-2">
          <div className="flex items-center justify-between text-xs font-share-tech">
            <span className="text-white/50">Service Price</span>
            <span className="text-white">
              {formatUsdcPrice(offering.priceUsdc)}
            </span>
          </div>
          <div className="flex items-center justify-between text-xs font-share-tech">
            <span className="text-white/50">Protocol Fee (2%)</span>
            <span className="text-white/70">
              ${protocolFee.toFixed(4)}
            </span>
          </div>
          <div className="border-t border-cp-cyan/10 pt-2 flex items-center justify-between text-xs font-share-tech">
            <span className="text-white/70 font-bold">Total</span>
            <span className="text-cp-acid font-bold font-orbitron">
              ${(priceNum + protocolFee).toFixed(4)}
            </span>
          </div>
          <p className="text-[9px] font-share-tech text-white/25 mt-1">
            A 2% protocol fee applies to all A2A transactions. Fees fuel the
            $RUN Buyback &amp; Burn.
          </p>
        </div>

        {/* ── Error Notice ───────────────────────────────────── */}
        {submitError && (
          <div className="flex items-start gap-2 mb-4 p-3 rounded bg-red-500/10 border border-red-500/20">
            <AlertTriangle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs font-share-tech text-red-300">
              {submitError}
            </p>
          </div>
        )}

        {/* ── Submit Button ──────────────────────────────────── */}
        <Button
          onClick={handleSubmit}
          disabled={
            !buyerAgentId ||
            createJob.isPending ||
            activeAgents.length === 0
          }
          className="w-full bg-cp-cyan/10 text-cp-cyan border border-cp-cyan/30 hover:bg-cp-cyan hover:text-cp-void font-orbitron text-xs uppercase tracking-widest transition-all duration-300 shadow-[0_0_10px_rgba(0,240,255,0.05)] hover:shadow-[0_0_20px_rgba(0,240,255,0.3)] disabled:opacity-40"
          variant="outline"
        >
          {createJob.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Processing...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Purchase Service
            </>
          )}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Generate a template JSON object from an inputSchema.
 * Maps JSON Schema types to placeholder values.
 */
function generateTemplate(
  schema: Record<string, unknown>,
): Record<string, unknown> {
  const properties = schema.properties as
    | Record<string, { type?: string; description?: string }>
    | undefined;

  if (!properties) return {};

  const template: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(properties)) {
    switch (prop.type) {
      case 'string':
        template[key] = prop.description ?? `your_${key}`;
        break;
      case 'number':
      case 'integer':
        template[key] = 0;
        break;
      case 'boolean':
        template[key] = false;
        break;
      case 'array':
        template[key] = [];
        break;
      case 'object':
        template[key] = {};
        break;
      default:
        template[key] = null;
    }
  }
  return template;
}
