import { curveMonotoneX } from '@visx/curve';
import { LinearGradient } from '@visx/gradient';
import { ParentSize } from '@visx/responsive';
import { scaleLinear } from '@visx/scale';
import { AreaClosed, LinePath } from '@visx/shape';
import { useId } from 'react';
import { useFxTheme } from '../../theme/ThemeProvider.js';
import { cn } from '../../utils/cn.js';

export interface FxLineChartProps {
  points: number[];
  /** Fixed height (default: fills the parent). */
  height?: number;
  /** Minimum y-axis top (mobile chart used a fixed 0–20 domain). */
  minDomainTop?: number;
  strokeWidth?: number;
  className?: string;
  'aria-label'?: string;
}

interface Point {
  x: number;
  y: number;
}

/** Port of lineChart.tsx (Skia) on @visx: gradient area + monotone line in the primary colour. */
export function FxLineChart({
  points,
  height,
  minDomainTop = 20,
  strokeWidth = 2,
  className,
  'aria-label': ariaLabel = 'Line chart',
}: FxLineChartProps) {
  const { colors } = useFxTheme();
  const gradientId = `fx-line-chart-${useId().replace(/:/g, '')}`;
  const data: Point[] = points.map((y, x) => ({ x, y }));
  const yMax = Math.max(minDomainTop, ...points, 0);

  return (
    <div className={cn('min-h-0 w-full flex-1', className)} style={{ height }}>
      <ParentSize debounceTime={50}>
        {({ width, height: h }) => {
          if (width <= 0 || h <= 0 || data.length === 0) return null;
          const xScale = scaleLinear<number>({
            domain: [0, Math.max(1, data.length - 1)],
            range: [1, width - 1],
          });
          const yScale = scaleLinear<number>({ domain: [0, yMax], range: [h - 1, 1] });
          return (
            <svg width={width} height={h} role="img" aria-label={ariaLabel}>
              <LinearGradient
                id={gradientId}
                from={colors.primary}
                to={colors.primary}
                fromOpacity={0.44}
                toOpacity={0.06}
              />
              <AreaClosed<Point>
                data={data}
                x={(d) => xScale(d.x)}
                y={(d) => yScale(d.y)}
                yScale={yScale}
                curve={curveMonotoneX}
                fill={`url(#${gradientId})`}
              />
              <LinePath<Point>
                data={data}
                x={(d) => xScale(d.x)}
                y={(d) => yScale(d.y)}
                curve={curveMonotoneX}
                stroke={colors.primary}
                strokeWidth={strokeWidth}
                fill="none"
              />
            </svg>
          );
        }}
      </ParentSize>
    </div>
  );
}
