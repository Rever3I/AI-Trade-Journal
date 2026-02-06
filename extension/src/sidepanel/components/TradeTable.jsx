import { t } from '../../lib/i18n.js';

/**
 * Trade preview table component.
 * Displays parsed trades before confirmation.
 * @param {Object} props
 * @param {Array} props.trades - Array of parsed trade objects
 */
export function TradeTable({ trades }) {
  if (!trades || trades.length === 0) {
    return null;
  }

  const columns = [
    { key: 'symbol', labelKey: 'colSymbol' },
    { key: 'action', labelKey: 'colAction' },
    { key: 'quantity', labelKey: 'colQuantity' },
    { key: 'price', labelKey: 'colPrice' },
    { key: 'datetime', labelKey: 'colDatetime' },
    { key: 'broker_detected', labelKey: 'colBroker' },
  ];

  function formatCellValue(key, value) {
    if (value === undefined || value === null) {
      return '-';
    }
    switch (key) {
      case 'price':
        return typeof value === 'number' ? value.toFixed(2) : String(value);
      case 'quantity':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      case 'datetime': {
        const date = new Date(value);
        return isNaN(date.getTime()) ? String(value) : date.toLocaleString();
      }
      default:
        return String(value);
    }
  }

  function getActionColor(action) {
    switch (action) {
      case 'BUY':
      case 'COVER':
        return 'text-profit';
      case 'SELL':
      case 'SHORT':
        return 'text-loss';
      default:
        return 'text-text-primary';
    }
  }

  return (
    <div class="overflow-x-auto rounded-lg border border-text-muted/10">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-tertiary/50">
            {columns.map((col) => (
              <th key={col.key} class="px-3 py-2 text-left text-xs font-medium text-text-secondary uppercase">
                {t(col.labelKey)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody class="divide-y divide-text-muted/10">
          {trades.map((trade, index) => (
            <tr key={index} class="hover:bg-surface-secondary/50 transition-colors">
              {columns.map((col) => (
                <td
                  key={col.key}
                  class={`px-3 py-2 whitespace-nowrap ${
                    col.key === 'action' ? getActionColor(trade[col.key]) : 'text-text-primary'
                  }`}
                >
                  {formatCellValue(col.key, trade[col.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
