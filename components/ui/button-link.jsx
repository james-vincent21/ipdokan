export function ButtonLink({ href, children }) {
  return (
    <a className="button" href={href}>
      {children}
    </a>
  );
}
