import type { Product } from './types';
import { stockOf } from './cart-stock';

type SpecProduct = Pick<Product, 'id' | 'specs' | 'variants' | 'inventory' | 'status' | 'color_images'>;

function validOptions(product: SpecProduct, options: readonly string[]) {
  const specs = product.specs ?? [];
  return options.length === specs.length && specs.every((dim, index) => dim.options.includes(options[index]));
}

function stockedVariants(product: SpecProduct) {
  const variants = product.variants ?? [];
  const counts = new Map<string, number>();
  for (const variant of variants) {
    const key = variant.options.join(' / ');
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return variants.filter((variant) => validOptions(product, variant.options)
    && counts.get(variant.options.join(' / ')) === 1
    && stockOf({ id: product.id, status: product.status, inventory: variant.inventory, variants: [] }, '') > 0);
}

export function initialSpecSelection(product: SpecProduct): string[] {
  const first = (product.specs ?? []).map((dim) => dim.options[0] ?? '');
  return stockOf(product, first.join(' / ')) > 0 ? first : [...(stockedVariants(product)[0]?.options ?? first)];
}

export function resolveSpecSelection(product: SpecProduct, selected: string[]): string[] {
  return validOptions(product, selected) ? selected : initialSpecSelection(product);
}

export function specOptionAvailable(product: SpecProduct, index: number, option: string): boolean {
  return stockedVariants(product).some((variant) => variant.options[index] === option);
}

// Keep the other choices where possible; avoid trapping shoppers between sold-out combinations.
export function selectSpecOption(product: SpecProduct, selected: string[], index: number, option: string): string[] {
  const candidate = selected.map((value, i) => i === index ? option : value);
  if (stockOf(product, candidate.join(' / ')) > 0) return candidate;
  const alternatives = stockedVariants(product).filter((variant) => variant.options[index] === option);
  const score = (options: string[]) => options.reduce((sum, value, i) => sum + (i !== index && value === selected[i] ? 1 : 0), 0);
  alternatives.sort((a, b) => score(b.options) - score(a.options));
  return [...(alternatives[0]?.options ?? candidate)];
}

export function selectedSpecImage(product: Pick<Product, 'color_images'>, selected: readonly string[], preferred = ''): string {
  const options = selected.includes(preferred) ? [preferred, ...selected] : selected;
  return options.map((option) => product.color_images?.[option]).find(Boolean) || '';
}
