import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  CURVE_SPECIAL_FORM,
  EXAMPLE_SETS,
  type ExampleSet,
  OPERATOR_RULES,
  type ReferenceFunction,
  TYPE_INFO,
  exampleSetNames,
  functionsInCategory,
  referenceConstants,
  referenceNaming,
  referenceTypes,
} from '../expressions';

interface ExpressionReferenceProps {
  /** Names already defined in the workspace (to flag clashing example sets). */
  readonly takenNames: ReadonlySet<string>;
  readonly onInsert: (text: string) => void;
  readonly onInsertSet: (set: ExampleSet) => void;
  readonly onClose: () => void;
}

function Section({ title, children, open = false }: { title: string; children: ReactNode; open?: boolean }) {
  return (
    <details className="ref-section" open={open}>
      <summary>{title}</summary>
      <div className="ref-body">{children}</div>
    </details>
  );
}

function Insertable({ text, onInsert }: { text: string; onInsert: (text: string) => void }) {
  const [added, setAdded] = useState(false);
  useEffect(() => {
    if (!added) return;
    const t = setTimeout(() => setAdded(false), 1200);
    return () => clearTimeout(t);
  }, [added]);
  return (
    <button
      type="button"
      className="ref-code insertable"
      title="Add as a new expression"
      onClick={() => {
        onInsert(text);
        setAdded(true);
      }}
    >
      <code>{text}</code>
      <span className="ref-add" aria-hidden="true">
        {added ? '✓' : '+'}
      </span>
    </button>
  );
}

function FunctionList({ items, onInsert }: { items: readonly ReferenceFunction[]; onInsert: (t: string) => void }) {
  return (
    <dl className="ref-functions">
      {items.map((f) => (
        <div key={f.name} className="ref-function">
          <dt>
            <code>{f.syntax}</code>
          </dt>
          <dd>
            <span className="ref-desc">{f.description}</span>
            <span className="ref-returns">→ {f.returns}</span>
            <Insertable text={f.example} onInsert={onInsert} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Built-in reference for the expression language. Function names,
 * signatures and descriptions come from the live registries; every example
 * is verified against the engine by the test suite.
 */
export function ExpressionReference({ takenNames, onInsert, onInsertSet, onClose }: ExpressionReferenceProps) {
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => rootRef.current?.focus(), []);

  // Escape closes the reference wherever focus is (e.g. after a button
  // inside it became disabled), except while typing in a text field.
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const t = e.target;
      if (t instanceof HTMLElement && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      close.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <section
      ref={rootRef}
      className="expression-reference"
      aria-label="Expression reference"
      tabIndex={-1}
    >
      <div className="section-head">
        <h2>Expression reference</h2>
        <button type="button" className="link expr-link" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="hint ref-lead">Click any example to add it to your expressions.</p>

      <Section title="Variables and names" open>
        <ul className="ref-rules">
          <li>
            <code>name = expression</code> defines a variable; a bare expression (no <code>=</code>) is evaluated and shown
            but cannot be referenced.
          </li>
          <li>Names use letters (Greek included), digits and <code>_</code>, and start with a letter or <code>_</code>.</li>
          <li>Each name may be defined once. <code>pi</code>, <code>π</code> and <code>j</code> are reserved.</li>
          <li>Order does not matter: expressions update whenever something they use changes.</li>
        </ul>
        <p className="ref-sub">Names declare an RF type when the value is a plain number:</p>
        <table className="ref-table">
          <thead>
            <tr>
              <th>Prefix</th>
              <th>Type</th>
              <th>e.g.</th>
            </tr>
          </thead>
          <tbody>
            {referenceNaming().map((r) => (
              <tr key={r.prefix}>
                <td>
                  <code>{r.prefix}</code>
                </td>
                <td>{r.typeLabel}</td>
                <td>
                  <code>{r.matches.slice(0, 3).join(', ')}</code>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="hint">
          The prefix must be followed by the end of the name, an uppercase letter, a digit or <code>_</code>: <code>zL</code> is
          an impedance, <code>zeta</code> is not. Use another name (e.g. <code>c1</code>) for curves.
        </p>
      </Section>

      <Section title="Constants and complex numbers">
        <ul className="ref-rules">
          {referenceConstants().map((c) => (
            <li key={c.name}>
              <code>{c.name}</code> — {c.meaning}
            </li>
          ))}
          <li>
            Imaginary literals: <code>j1.2</code> or <code>1.2j</code>; so a name cannot be <code>j</code> followed by digits.
          </li>
          <li>
            Numbers: <code>2</code>, <code>0.5</code>, <code>.5</code>, <code>1e-3</code>.
          </li>
        </ul>
        <Insertable text="zE = 0.5 - j1.2" onInsert={onInsert} />
      </Section>

      <Section title="Operators and syntax">
        <ul className="ref-rules">
          <li>
            <code>+ − * / ^</code> and parentheses; <code>^</code> binds tightest and is right-associative, so{' '}
            <code>-2^2 = −4</code>.
          </li>
          <li>
            <strong>No implicit multiplication</strong>: write <code>2*pi</code>, not <code>2pi</code>; <code>j*4*pi*l</code>, not{' '}
            <code>j4πl</code>.
          </li>
          <li>Functions are called with parentheses: <code>vswr(zL)</code>.</li>
          <li>
            <code>−</code>, <code>×</code>, <code>·</code>, <code>÷</code> are accepted, so displayed results can be pasted back.
          </li>
        </ul>
        <p className="ref-sub">Types follow the operation:</p>
        <table className="ref-table">
          <tbody>
            {OPERATOR_RULES.map((r) => (
              <tr key={r.expression}>
                <td>
                  <code>{r.expression}</code>
                </td>
                <td className={r.result === 'error' ? 'ref-error' : undefined}>
                  {r.result === 'error' ? 'error' : TYPE_INFO[r.result].label}
                </td>
                <td className="ref-note">{r.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="Mathematical functions">
        <FunctionList items={functionsInCategory('math', 'complex')} onInsert={onInsert} />
      </Section>

      <Section title="RF functions">
        <p className="hint">
          Conversions use the workspace Z₀ where physical impedance (Ω) is involved. Applied to a plain number, <code>z()</code>,{' '}
          <code>y()</code>, <code>gamma()</code> and <code>Z()</code> declare its type.
        </p>
        <FunctionList items={functionsInCategory('rf')} onInsert={onInsert} />
      </Section>

      <Section title="Curves and constructions">
        <FunctionList items={[...functionsInCategory('curve'), CURVE_SPECIAL_FORM]} onInsert={onInsert} />
        <p className="hint">Curves cannot be used in arithmetic. Select a curve on the chart to inspect points along it.</p>
      </Section>

      <Section title="Intersections and point queries">
        <FunctionList items={functionsInCategory('query')} onInsert={onInsert} />
        <p className="hint">
          Intersections are numbered by increasing Re Γ (upper point first when equal). Γ = 1 (z = ∞) is a real intersection
          of every r-circle and x-arc, and comes last.
        </p>
      </Section>

      <Section title="Types, plotting and sliders">
        <table className="ref-table">
          <tbody>
            {referenceTypes().map((t) => (
              <tr key={t.type}>
                <td className="ref-symbol">{t.symbol}</td>
                <td>{t.label}</td>
                <td className="ref-note">{t.display}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <ul className="ref-rules">
          <li>Points outside the chart (|Γ| &gt; 1) are reported in the row instead of plotted.</li>
          <li>
            <strong>Sliders</strong>: for <code>name = number</code>, press ⇿ to attach a slider (lengths default to 0–0.5λ).
            Moving it rewrites the number in the expression.
          </li>
          <li>
            <strong>Dragging</strong>: a point written as a literal (<code>zL = 0.5 + j1.2</code>) can be dragged on the chart;
            computed points cannot.
          </li>
        </ul>
      </Section>

      <Section title="Examples" open>
        <div className="ref-examples">
          {EXAMPLE_SETS.map((set) => {
            const clashes = exampleSetNames(set).filter((n) => takenNames.has(n));
            return (
              <div key={set.id} className="ref-example">
                <div className="ref-example-head">
                  <strong>{set.title}</strong>
                  <button
                    type="button"
                    className="link expr-link"
                    disabled={clashes.length > 0}
                    title={clashes.length > 0 ? `Already defined: ${clashes.join(', ')}` : 'Add all lines'}
                    onClick={() => onInsertSet(set)}
                  >
                    + Add all
                  </button>
                </div>
                <span className="hint">{set.summary}</span>
                <pre className="ref-pre">{set.lines.map((l) => l.text + (l.slider ? '   ⇿' : '')).join('\n')}</pre>
                {clashes.length > 0 && <span className="ref-clash">Already defined: {clashes.join(', ')}</span>}
              </div>
            );
          })}
        </div>
      </Section>
    </section>
  );
}
