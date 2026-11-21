import React, { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

function TestCounter() {
  const [count, setCount] = useState(0);
  return (
    <div>
      <span data-testid="count-display">Count: {count}</span>
      <button type="button" onClick={() => setCount((c) => c + 1)}>
        Increment
      </button>
    </div>
  );
}

describe('React 19 & Testing Library Sanity Harness', () => {
  it('renders component, executes state transitions, and asserts DOM updates cleanly', () => {
    render(<TestCounter />);
    const display = screen.getByTestId('count-display');
    const button = screen.getByRole('button', { name: /increment/i });

    expect(display).toHaveTextContent('Count: 0');
    fireEvent.click(button);
    expect(display).toHaveTextContent('Count: 1');
  });
});
