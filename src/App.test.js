import { render, screen } from '@testing-library/react';
import App from './App';

test('renders dashboard heading', () => {
  render(<App />);
  const heading = screen.getByText(/inventory dashboard/i);
  expect(heading).toBeInTheDocument();
});
