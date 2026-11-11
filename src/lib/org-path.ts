/** Where signing in lands: the person's organizations (or straight into their only one). */
export const HOME_PATH = "/organizations";

/** A path inside an organization: orgPath("acme", "/board") → "/acme/board"; "/" → "/acme". */
export function orgPath(slug: string, path = "/"): string {
  return path === "/" ? `/${slug}` : `/${slug}${path}`;
}
