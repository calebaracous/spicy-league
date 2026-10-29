import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "What data Spicy League collects, why, and who it is shared with.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="October 28, 2026">
      <p>
        This policy explains what personal data Spicy League collects when you use{" "}
        <a href="https://www.spicyleague.dev">www.spicyleague.dev</a> or interact with our Discord
        bot, why we collect it, and who it is shared with. It applies alongside our{" "}
        <Link href="/terms">Terms of Service</Link>.
      </p>
      <p>
        The short version: we collect what is needed to run a community tournament and nothing else.
        We do not run advertising or analytics trackers, and we do not sell your data.
      </p>

      <h2>1. What we collect</h2>

      <h3>Account information</h3>
      <ul>
        <li>
          <strong>Email address</strong>&nbsp;&mdash; required for registration, verification, and
          password resets. It is never shown publicly.
        </li>
        <li>
          <strong>Password</strong>&nbsp;&mdash; stored only as a salted hash. We cannot read it.
        </li>
        <li>
          <strong>Username and display name</strong>&nbsp;&mdash; both public.
        </li>
        <li>
          <strong>Discord username</strong>&nbsp;&mdash; required to create an account and to sign
          up for a season, so league admins and captains can reach you. It is shown to signed-in
          players on your profile and to admins, never to signed-out visitors. We don&rsquo;t verify
          it with Discord.
        </li>
        <li>
          <strong>Optional profile fields</strong>&nbsp;&mdash; bio, pronouns, and an OP.GG URL, all
          public if you provide them.
        </li>
      </ul>

      <h3>Technical and session data</h3>
      <ul>
        <li>
          When you sign in we create a session record containing a session token, its expiry, and
          the <strong>IP address</strong> and <strong>browser user-agent</strong> of the sign-in.
          This is standard security bookkeeping used to keep you signed in and to detect abuse.
        </li>
        <li>
          Our hosting and database providers keep their own operational logs, which may include IP
          addresses.
        </li>
        <li>
          An <strong>activity log</strong> of what happens on the site: for example account
          creation, profile edits (with the old and new values), linked accounts, signups, draft
          picks, match reports, and admin actions. Only league admins can see it, it holds no
          passwords or IP addresses, and entries are deleted after 60 days.
        </li>
      </ul>

      <h3>League participation</h3>
      <ul>
        <li>
          Season signups, including your role preferences (LoL), map preferences (CS2), and any
          notes and moral-quandary answer you write.
        </li>
        <li>
          Captain status, draft picks made and received, team membership, and match results you
          report.
        </li>
      </ul>

      <h3>Linked game accounts</h3>
      <ul>
        <li>
          If you link a Riot account, we store your Riot ID (<code>gameName#tagLine</code>) and the
          PUUID that Riot returns for it, and we periodically fetch your public ranked standing and
          top champion mastery from the Riot Games API. These are shown on your public profile.
        </li>
        <li>
          Per-player stats from League of Legends games played in Spicy League (KDA, CS, damage,
          champions played and similar), fetched from the Riot Games API, are shown publicly only if
          you opt in. Opting in is required to sign up for a League of Legends season; you can opt
          out at any time on your profile page, which hides your per-player stats (team and champion
          totals still show) without affecting your existing signups.
        </li>
        <li>
          If you link a Steam or Leetify account, we store the identifier or profile URL you
          provide. We do not currently call the Steam or Leetify APIs.
        </li>
        <li>All account linking is optional and can be undone from your profile page.</li>
      </ul>

      <h3>Discord</h3>
      <p>
        Our Discord bot can read messages in the channels of the Spicy League Discord server that it
        has been granted access to, and posts league updates into that server. We do not store
        Discord message content in our database, and we do not read direct messages. Your activity
        within Discord is also subject to Discord&rsquo;s own privacy policy.
      </p>
      <p>
        The bot also manages league roles and team channels in the server (for example Captain, your
        team&rsquo;s role and private channel, Signed up, Sub list and Champion), can set your
        server nickname to your display name, opens a thread per match and posts match reminders and
        results there, and answers slash commands such as <code>/standings</code> and{" "}
        <code>/rank</code>. To do that we look up the Discord username on your profile in the Spicy
        League server and store the matching Discord user ID with your account. Changing your
        Discord username on your profile clears it. If we can&rsquo;t match your username, an admin
        may email you to ask you to fix it.
      </p>

      <h2>2. What we do not collect</h2>
      <ul>
        <li>
          No payment or financial information &mdash; Spicy League is free and has no entry fee.
        </li>
        <li>No advertising, analytics, or cross-site tracking cookies.</li>
        <li>No precise location data.</li>
        <li>
          No special-category data. Please do not put sensitive personal information in your bio or
          signup notes.
        </li>
      </ul>

      <h2>3. Cookies</h2>
      <p>
        We set up to three cookies, all used only to keep you signed in. They are strictly necessary
        for the site to function, are removed when you sign out, and are not shared with any third
        party. On the live site their names begin with <code>__Secure-</code>.
      </p>
      <ul>
        <li>
          <code>sl.session_token</code>&nbsp;&mdash; identifies your signed-in session. Lasts 30
          days if you choose to stay signed in, otherwise until you close your browser.
        </li>
        <li>
          <code>sl.session_data</code>&nbsp;&mdash; a short-lived copy of your session details so
          pages load without a database lookup. Expires after 5 minutes.
        </li>
        <li>
          <code>sl.dont_remember</code>&nbsp;&mdash; set only when you sign in without choosing to
          stay signed in, so your session ends when you close your browser.
        </li>
      </ul>
      <p>
        We do not use cookies for advertising or analytics, which is why you will not see a cookie
        consent banner.
      </p>

      <h2>4. How we use your data</h2>
      <ul>
        <li>To create and secure your account, and to verify your email address.</li>
        <li>To run seasons: signups, drafts, schedules, standings, and results.</li>
        <li>To display public profiles, rosters, and league pages.</li>
        <li>To send transactional email &mdash; email verification and password resets.</li>
        <li>To post league updates to our Discord server.</li>
        <li>To prevent abuse, enforce our Terms, and apply rate limits.</li>
      </ul>
      <p>
        Where the GDPR or similar laws apply, we rely on <strong>contract</strong> (running the
        league you signed up for), <strong>legitimate interests</strong> (security, abuse
        prevention), and <strong>consent</strong> (optional profile fields and linked game accounts,
        which you may withdraw at any time by removing them).
      </p>

      <h2>5. Who we share it with</h2>
      <p>
        We do not sell your data or share it for advertising. We use the following service providers
        to operate the site:
      </p>
      <ul>
        <li>
          <strong>Vercel</strong>&nbsp;&mdash; website hosting and request logs.
        </li>
        <li>
          <strong>Neon</strong>&nbsp;&mdash; the Postgres database where the data above is stored.
        </li>
        <li>
          <strong>Resend</strong>&nbsp;&mdash; delivery of verification and password-reset emails
          (receives your email address).
        </li>
        <li>
          <strong>Upstash</strong>&nbsp;&mdash; Redis used for rate limiting.
        </li>
        <li>
          <strong>Riot Games</strong>&nbsp;&mdash; receives your PUUID when we refresh your stats,
          if you have linked a Riot account.
        </li>
        <li>
          <strong>Discord</strong>&nbsp;&mdash; receives league updates that we publish to our
          server.
        </li>
      </ul>
      <p>
        We may also disclose data where required by law, or to protect the rights and safety of our
        users. These providers are based in or process data in the United States; if you are
        accessing the site from elsewhere, your data will be transferred there.
      </p>

      <h2>6. What is public</h2>
      <p>
        Your profile at <code>/users/&lt;username&gt;</code> is publicly visible without signing in.
        It shows your username, display name, pronouns and bio (if set), linked Riot ID, ranked
        standing and top champions, and any OP.GG or Leetify links you have added. Your season
        signups, team, draft picks, and match results are also public, as are your per-player stats
        from league games if you have opted in.{" "}
        <strong>
          Your email address, password, IP address, and session data are never shown publicly.
        </strong>
      </p>

      <h2>7. Retention</h2>
      <p>
        We keep account and league data for as long as your account exists, because season history
        and standings are part of the league&rsquo;s public record. Sessions expire automatically.
        Riot stat snapshots are overwritten on each refresh rather than accumulating history. The
        admin activity log keeps entries for 60 days. If you delete your account, we remove your
        personal data as described below.
      </p>

      <h2>8. Your rights</h2>
      <p>
        You can view and edit most of your data yourself from your profile page, including your
        display name, bio, pronouns, and linked accounts. Depending on where you live, you may also
        have the right to request access to, correction of, deletion of, or a copy of your personal
        data, and to object to certain processing.
      </p>
      <p>
        You can delete your account yourself from your public profile page (there&rsquo;s a link at
        the bottom of your profile). This removes your profile, sign-in, Discord and game account
        details, and any signups for seasons that haven&rsquo;t started. If you have played in past
        seasons or 10-mans, those rosters and results are kept in anonymised form, shown as
        &ldquo;Deleted player&rdquo;, so past seasons remain coherent. While you are in a season
        that is under way or an unfinished 10-man, deletion waits until it is over.
      </p>
      <p>
        To make any other request, email{" "}
        <a href="mailto:contact@spicyleague.dev">contact@spicyleague.dev</a>&nbsp;from the address
        on your account. We will respond within 30 days.
      </p>

      <h2>9. Children</h2>
      <p>
        Spicy League is not intended for anyone under 13. We do not knowingly collect data from
        children under 13. If you believe a child has given us personal data, email us and we will
        delete it.
      </p>

      <h2>10. Security</h2>
      <p>
        Traffic is served over HTTPS, passwords are hashed, and access to the production database is
        restricted to league administrators. No system is perfectly secure, so we cannot guarantee
        absolute security &mdash; please use a unique password. If we become aware of a breach
        affecting your data, we will notify affected users in the Spicy League Discord and by email.
      </p>

      <h2>11. Changes to this policy</h2>
      <p>
        We may update this policy as the site changes. The &ldquo;last updated&rdquo; date at the
        top reflects the current version, and material changes will be announced in the Spicy League
        Discord.
      </p>

      <h2>12. Contact</h2>
      <p>
        For any privacy question or request, email{" "}
        <a href="mailto:contact@spicyleague.dev">contact@spicyleague.dev</a>.
      </p>
    </LegalPage>
  );
}
