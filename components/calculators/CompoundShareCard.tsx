"use client"

import * as React from "react"
import { forwardRef } from "react"
import { Zap, TrendingUp, DollarSign, Wallet } from "lucide-react"

export interface CompoundShareCardProps {
  finalYear: {
    total: number
    principal: number
    contributions: number
    interest: number
  }
  inputs: {
    principal: number
    contribution: number
    interestRate: number
    years: number
  }
}

// Local formatCurrency helper if the one from format.ts is different
const formatCurr = (value: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value)

export const CompoundShareCard = forwardRef<HTMLDivElement, CompoundShareCardProps>(
  ({ finalYear, inputs }, ref) => {
    const totalInvested = finalYear.principal + finalYear.contributions
    const interest = finalYear.interest
    const total = finalYear.total

    const roi = totalInvested > 0 ? (interest / totalInvested) * 100 : 0

    return (
      <div
        ref={ref}
        className="w-[1080px] h-[1080px] bg-[#0a0a0c] text-white flex flex-col justify-between overflow-hidden relative font-sans"
        style={{
          backgroundImage: "radial-gradient(circle at 100% 0%, rgba(16,185,129,0.15) 0%, transparent 50%), radial-gradient(circle at 0% 100%, rgba(59,130,246,0.1) 0%, transparent 40%)",
        }}
      >
        {/* Marca d'água de fundo */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] pointer-events-none">
          <Zap className="w-[800px] h-[800px] text-emerald-500" />
        </div>

        {/* Top Header */}
        <div className="p-16 flex items-center justify-between z-10 border-b border-white/10 bg-white/5 backdrop-blur-md">
          <div>
            <h1 className="text-5xl font-black tracking-tighter text-white">
              Compound Interest
            </h1>
            <p className="text-3xl font-medium text-white/60 mt-2">
              The 8th Wonder of the World
            </p>
          </div>
          <div className="text-right">
            <h2 className="text-4xl font-black tracking-tight text-white/90">BullValue</h2>
            <p className="text-2xl text-emerald-500 font-medium">Investment Calculator</p>
          </div>
        </div>

        {/* Main Content */}
        <div className="p-16 flex-1 flex flex-col justify-center gap-12 z-10">
          
          {/* Final Balance */}
          <div className="bg-white/5 border border-emerald-500/20 p-12 rounded-[2rem] backdrop-blur-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-20">
              <TrendingUp className="w-32 h-32 text-emerald-500" />
            </div>
            <p className="text-2xl uppercase tracking-widest text-emerald-500/80 mb-4 font-semibold">Final Balance</p>
            <p className="text-[120px] leading-none font-black tabular-nums tracking-tighter text-white">
              {formatCurr(total)}
            </p>
            <p className="text-3xl font-bold text-white/60 mt-6">
              +{roi.toFixed(1)}% Total Return
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10">
            {/* Total Invested */}
            <div className="bg-white/5 border border-white/10 p-10 rounded-[2rem] backdrop-blur-xl flex items-center gap-8">
              <div className="bg-blue-500/20 p-6 rounded-3xl">
                <Wallet className="w-12 h-12 text-blue-500" />
              </div>
              <div>
                <p className="text-xl uppercase tracking-widest text-white/50 mb-2">Total Invested</p>
                <p className="text-6xl font-bold tabular-nums tracking-tight text-white">
                  {formatCurr(totalInvested)}
                </p>
              </div>
            </div>

            {/* Total Interest */}
            <div className="bg-white/5 border border-white/10 p-10 rounded-[2rem] backdrop-blur-xl flex items-center gap-8">
              <div className="bg-emerald-500/20 p-6 rounded-3xl">
                <DollarSign className="w-12 h-12 text-emerald-500" />
              </div>
              <div>
                <p className="text-xl uppercase tracking-widest text-white/50 mb-2">Total Interest</p>
                <p className="text-6xl font-bold tabular-nums tracking-tight text-emerald-400">
                  +{formatCurr(interest)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer Assumptions */}
        <div className="p-16 border-t border-white/10 bg-black/40 z-10">
          <p className="text-2xl text-white/40 uppercase tracking-widest mb-8 font-semibold">
            Assumptions
          </p>
          <div className="grid grid-cols-4 gap-8">
            <div className="space-y-2">
              <p className="text-xl text-white/50">Initial Amount</p>
              <p className="text-4xl font-bold text-white/90">{formatCurr(inputs.principal)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xl text-white/50">Contribution</p>
              <p className="text-4xl font-bold text-white/90">{formatCurr(inputs.contribution)}</p>
            </div>
            <div className="space-y-2">
              <p className="text-xl text-white/50">Return Rate</p>
              <p className="text-4xl font-bold text-white/90">{inputs.interestRate}%</p>
            </div>
            <div className="space-y-2">
              <p className="text-xl text-white/50">Time Horizon</p>
              <p className="text-4xl font-bold text-white/90">{inputs.years} Years</p>
            </div>
          </div>
        </div>
      </div>
    )
  }
)

CompoundShareCard.displayName = "CompoundShareCard"
