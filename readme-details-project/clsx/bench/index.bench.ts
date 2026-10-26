import classnames from 'classnames';
import { Bench } from 'tinybench';
import { clsx, type ClassValue } from '../src/index';
import { clsx as clsxLite } from '../src/lite';

const scenarios: Record<string, ClassValue[]> = {
  strings: ['foo', { bar: true }, 'baz', ['quux']],
  objects: ['foo', { bar: true, duck: true, baz: false, quux: false }, 'baz', {}],
  arrays: ['a', ['b', ['c', ['d', ['e']]]], { f: true, g: true }],
  falsy: ['', { a: false, b: true }, null, [0, 'x']],
};

const bench = new Bench({ time: 500, warmupTime: 100 });

for (const [name, args] of Object.entries(scenarios)) {
  bench
    .add(`clsx       ${name}`, () => {
      clsx(...args);
    })
    .add(`classnames ${name}`, () => {
      classnames(...(args as Parameters<typeof classnames>));
    });
  // The lite build does not support object maps, so it skips that scenario.
  if (name !== 'objects') {
    bench.add(`lite       ${name}`, () => {
      clsxLite(...(args as Parameters<typeof clsxLite>));
    });
  }
}

await bench.run();

console.table(
  bench.tasks.map((task) => ({
    name: task.name,
    'ops/sec': Math.round(task.result?.hz ?? 0).toLocaleString('en-US'),
    'avg (ns)': Math.round((task.result?.mean ?? 0) * 1e6),
  })),
);
