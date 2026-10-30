export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.split('=').slice(1).join('=');
}
export function positional(): string[] {
  const out: string[] = [];
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i]!;
    if (a.startsWith('--')) {
      if (!a.includes('=')) i++;
      continue;
    }
    out.push(a);
  }
  return out;
}
