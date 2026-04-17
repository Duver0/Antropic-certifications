export interface Certificate {
  /** Human-readable certificate / course title */
  title: string;
  /** ISO date string or human-readable date (e.g. "2024-03-15") */
  issueDate: string;
  /** URL of the originating course on Skilljar */
  courseUrl: string;
  /** URL of the badge or certificate image */
  badgeImageUrl: string;
  /** Optional short description of the course */
  description?: string;
}
