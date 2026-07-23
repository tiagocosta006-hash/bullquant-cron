"use client";

import { useState, useMemo } from "react";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Info, Maximize2 } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

type DataPoint = { date: string; value: number };
type TabType = "1y" | "5y" | "max";

interface MacroDashboardClientProps {
  initialData: Record<string, DataPoint[]>;
}

// Rule #4: Extracted out to prevent re-renders
const MacroTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    const val = payload[0].value;
    const date = new Date(label);
    return (
      <div className="rounded-lg border border-border/50 bg-background/95 p-2 shadow-xl backdrop-blur-sm pointer-events-none">
        <p className="text-xs text-muted-foreground mb-1 capitalize">
          {isNaN(date.getTime()) 
            ? label 
            : `${date.toLocaleString('pt-PT', { month: 'short' })} ${date.getFullYear()}`}
        </p>
        <p className="text-sm font-bold text-foreground">{val.toFixed(2)}%</p>
      </div>
    );
  }
  return null;
};

function MacroCard({ 
  title, 
  description, 
  data, 
  colorStr = "hsl(var(--primary))",
  isWarning = false
}: { 
  title: string; 
  description: string; 
  data: DataPoint[]; 
  colorStr?: string;
  isWarning?: boolean;
}) {
  const [activeTab, setActiveTab] = useState<TabType>("max");
  const [isFullscreen, setIsFullscreen] = useState(false);

  const filteredData = useMemo(() => {
    if (data.length === 0) return [];
    if (activeTab === "max") return data;

    const now = new Date();
    let yearsToSubtract = 0;
    if (activeTab === "1y") yearsToSubtract = 1;
    if (activeTab === "5y") yearsToSubtract = 5;

    const cutoffDate = new Date(now);
    cutoffDate.setFullYear(cutoffDate.getFullYear() - yearsToSubtract);
    
    return data.filter(p => new Date(p.date) >= cutoffDate);
  }, [data, activeTab]);

  const latestValue = data.length > 0 ? data[data.length - 1].value : 0;
  // If Yield Curve is inverted, use red
  const actualColor = isWarning && latestValue < 0 ? "#ef4444" : colorStr;

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.getFullYear().toString();
  };

  const renderChart = (height: string | number = "100%", showAxes = false) => (
    <div className={`w-full ${typeof height === 'string' ? height : `h-[${height}px]`}`} style={typeof height === 'number' ? { height: `${height}px` } : { height }}>
      {filteredData.length > 0 ? (
        <ResponsiveContainer width="100%" height="100%" className="outline-none focus:outline-none">
          {/* Rule #2: Fix focus ring on Recharts wrappers */}
          <div className="h-full w-full [&_*:focus]:outline-none [&_*:focus]:ring-0" tabIndex={-1}>
            <AreaChart data={filteredData} margin={{ top: 10, right: showAxes ? 5 : 0, left: showAxes ? 0 : 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`gradient-${title.replace(/\s+/g, '')}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={actualColor} stopOpacity={0.4} />
                  <stop offset="95%" stopColor={actualColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis 
                dataKey="date" 
                hide={!showAxes} 
                tickFormatter={formatDate}
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                minTickGap={40}
              />
              {/* Rule #1: dynamic domain */}
              <YAxis 
                hide={!showAxes} 
                domain={[(dataMin: number) => Math.min(0, dataMin), 'auto']} 
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#888888', fontSize: 12 }}
                tickFormatter={(val) => `${val}%`}
                width={50}
                orientation="right"
              />
              <Tooltip content={<MacroTooltip />} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={actualColor} 
                fillOpacity={1} 
                fill={`url(#gradient-${title.replace(/\s+/g, '')})`} 
                strokeWidth={2}
                isAnimationActive={false}
              />
            </AreaChart>
          </div>
        </ResponsiveContainer>
      ) : (
        <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
          Sem dados históricos
        </div>
      )}
    </div>
  );

  const tabs: TabType[] = ["1y", "5y", "max"];

  const renderHeaderControls = () => (
    <div className="flex bg-muted/50 p-1 rounded-lg border border-border/40 w-fit">
      {tabs.map(tab => (
        <button
          key={tab}
          onClick={() => setActiveTab(tab)}
          className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
            activeTab === tab 
              ? 'bg-background shadow-sm text-foreground' 
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          {tab.toUpperCase()}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col rounded-xl border border-border/50 bg-card p-5 shadow-sm">
      <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            {title}
            <div className="group relative">
              <Info className="h-4 w-4 text-muted-foreground" />
              <div className="pointer-events-none absolute left-1/2 bottom-full z-10 mb-2 w-64 -translate-x-1/2 rounded-md border border-border bg-popover p-3 text-xs text-popover-foreground opacity-0 shadow-lg transition-all group-hover:opacity-100">
                {description}
              </div>
            </div>
          </h2>
          <p className="mt-2 text-4xl font-black tabular-nums tracking-tight">
            {latestValue.toFixed(2)}%
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          {renderHeaderControls()}
          
          <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
            {/* @ts-ignore - shadcn base-ui migration */}
            <DialogTrigger asChild>
              <button
                className="flex items-center justify-center h-8 w-8 ml-1 text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-all border border-transparent hover:border-border/40 shadow-sm"
                title="Fullscreen"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </DialogTrigger>
            {/* Rule #2: Remove dialog focus ring */}
            <DialogContent className="sm:max-w-6xl w-[95vw] h-[85vh] flex flex-col bg-card border-border/50 outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between mt-2 gap-4">
                <div>
                  <DialogTitle className="text-xl">{title}</DialogTitle>
                  <p className="mt-1 text-3xl font-black tabular-nums tracking-tight">
                    {latestValue.toFixed(2)}%
                  </p>
                </div>
                {renderHeaderControls()}
              </div>
              <div className="flex-1 mt-6 min-h-0 w-full pb-4">
                {renderChart("100%", true)}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-8 h-[220px] w-full">
        {/* We always show axes now, as requested */}
        {renderChart("100%", true)}
      </div>
    </div>
  );
}

export function MacroDashboardClient({ initialData }: MacroDashboardClientProps) {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-2">
      <MacroCard 
        title="10-Year Treasury Yield" 
        description="A Taxa Livre de Risco (Risk-Free Rate). É a âncora de todo o mercado financeiro. Quando esta taxa sobe, as avaliações das ações tendem a descer, pois os investidores exigem maior retorno."
        data={initialData['^DGS10'] || []}
        colorStr="#eab308" // yellow-500
      />
      <MacroCard 
        title="Curva de Rendimentos (10Y - 2Y)" 
        description="A diferença entre os juros a 10 anos e 2 anos. Uma curva invertida (valor negativo, a vermelho) tem sido historicamente o sinal de alarme número um de que uma recessão se aproxima."
        data={initialData['^T10Y2Y'] || []}
        colorStr="#3b82f6" // blue-500
        isWarning={true}
      />
      <MacroCard 
        title="Inflação (CPI YoY)" 
        description="A variação percentual anual do Consumer Price Index. Uma inflação alta corrói o poder de compra e força os bancos centrais a subir as taxas de juro, asfixiando a economia."
        data={initialData['^CPI_YOY'] || []}
        colorStr="#10b981" // emerald-500
      />
      <MacroCard 
        title="Federal Funds Rate" 
        description="A taxa de juro diretora estipulada pela Reserva Federal. Dita a facilidade com que o dinheiro flui na economia inteira, determinando os ciclos de expansão ou retração."
        data={initialData['^FEDFUNDS'] || []}
        colorStr="#8b5cf6" // violet-500
      />
    </div>
  );
}
