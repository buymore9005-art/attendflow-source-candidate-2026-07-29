import { render, screen } from '@testing-library/react';
import { App } from './App';

test('renders the application identity', () => {
  render(<App />);
  expect(screen.getByText('AttendFlow')).toBeInTheDocument();
});
