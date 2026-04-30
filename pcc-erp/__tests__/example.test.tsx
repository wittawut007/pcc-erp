import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('Example Test', () => {
  it('should render a basic element correctly', () => {
    render(<div data-testid="test-element">Hello, Vitest!</div>);
    
    const element = screen.getByTestId('test-element');
    expect(element).toBeInTheDocument();
    expect(element).toHaveTextContent('Hello, Vitest!');
  });
});
