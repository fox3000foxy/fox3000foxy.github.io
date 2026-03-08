import { Link } from 'react-router-dom';

interface Props {
  message?: string;
}

export default function NotFound({ message }: Props) {
  return (
    <div>
      <h2>404</h2>
      <p>{message || 'Page not found.'}</p>
      <p>
        <Link to="/">Return home</Link>
      </p>
    </div>
  );
}