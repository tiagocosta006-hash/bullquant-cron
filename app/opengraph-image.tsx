import { ImageResponse } from 'next/og'

// Dimensions standard para Open Graph
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'center',
          background: '#100f0d',
          padding: '80px 96px',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Decorative circles (background glow) */}
        <div
          style={{
            position: 'absolute',
            top: -120,
            right: -80,
            width: 500,
            height: 500,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(228,170,51,0.12) 0%, rgba(228,170,51,0) 70%)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: -80,
            right: 200,
            width: 320,
            height: 320,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(228,170,51,0.08) 0%, rgba(228,170,51,0) 70%)',
          }}
        />

        {/* Wordmark */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
          <span
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: '#fafaf7',
              letterSpacing: '-3px',
              lineHeight: 1,
            }}
          >
            Bull
          </span>
          <span
            style={{
              fontSize: 96,
              fontWeight: 800,
              color: '#E4AA33',
              letterSpacing: '-3px',
              lineHeight: 1,
            }}
          >
            Value
          </span>
        </div>

        {/* Tagline */}
        <div
          style={{
            marginTop: 24,
            fontSize: 28,
            color: '#a09980',
            letterSpacing: '0.02em',
            fontWeight: 400,
          }}
        >
          Análise Fundamental · DCF · Analista IA
        </div>

        {/* Description */}
        <div
          style={{
            marginTop: 40,
            fontSize: 22,
            color: '#6b6452',
            maxWidth: 680,
            lineHeight: 1.5,
            fontWeight: 400,
          }}
        >
          10 anos de dados fundamentais, calculadora DCF integrada e Analista IA.
          Em português, gratuito.
        </div>

        {/* Bottom bar */}
        <div
          style={{
            position: 'absolute',
            bottom: 60,
            left: 96,
            right: 96,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 18, color: '#3d3929', fontWeight: 500 }}>
            thebullvalue.com
          </span>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              background: 'rgba(228,170,51,0.12)',
              border: '1px solid rgba(228,170,51,0.25)',
              borderRadius: 100,
              padding: '8px 20px',
            }}
          >
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#E4AA33',
              }}
            />
            <span style={{ fontSize: 16, color: '#E4AA33', fontWeight: 600 }}>
              Gratuito
            </span>
          </div>
        </div>

        {/* Decorative chart lines (right side) */}
        <svg
          style={{
            position: 'absolute',
            right: 80,
            top: '50%',
            transform: 'translateY(-50%)',
            opacity: 0.15,
          }}
          width="280"
          height="160"
          viewBox="0 0 280 160"
        >
          <polyline
            points="0,120 40,100 80,105 120,80 160,60 200,40 240,20 280,10"
            fill="none"
            stroke="#E4AA33"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <polyline
            points="0,140 40,135 80,130 120,118 160,100 200,90 240,70 280,55"
            fill="none"
            stroke="#E4AA33"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    ),
    { ...size }
  )
}
