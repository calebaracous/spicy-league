import type { Metadata } from "next";
import Link from "next/link";

import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The rules for using Spicy League.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" updated="August 17, 2026">
      <p>
        Spicy League (&ldquo;Spicy League&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is a
        community-run platform for organising captains-draft tournaments in League of Legends and
        Counter-Strike 2, available at <a href="https://www.spicyleague.dev">www.spicyleague.dev</a>{" "}
        and through our associated Discord server and Discord bot.
      </p>
      <p>
        By creating an account, signing up for a season, or otherwise using the site, you agree to
        these Terms. If you do not agree, please do not use Spicy League.
      </p>

      <h2>1. Eligibility</h2>
      <p>
        You must be at least 13 years old to use Spicy League. If you are under the age of majority
        where you live, you may only use the service with the involvement of a parent or guardian.
        Where you interact with us through Discord, you must also meet Discord&rsquo;s own minimum
        age requirement and comply with the Discord Terms of Service and Community Guidelines.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>
          You need an account to sign up for seasons, captain a team, or report match results.
          Registration requires a valid email address, which you must verify.
        </li>
        <li>
          Your <strong>username</strong> is permanent once chosen and becomes part of your public
          profile URL. Your display name can be changed at any time.
        </li>
        <li>
          Keep your password confidential. You are responsible for activity that happens under your
          account. Tell us promptly if you believe it has been compromised.
        </li>
        <li>
          One account per person. Do not create additional accounts to circumvent a suspension,
          manipulate a draft, or misrepresent your skill level.
        </li>
      </ul>

      <h2>3. Community conduct</h2>
      <p>Spicy League is a casual community league. While using the site or our Discord, do not:</p>
      <ul>
        <li>
          harass, threaten, or abuse other players, including through hate speech targeting any
          protected characteristic;
        </li>
        <li>
          cheat, use unauthorised third-party software, exploit bugs, intentionally lose matches, or
          play on an account that is not yours;
        </li>
        <li>
          misrepresent your rank or identity in order to influence draft position or team balance;
        </li>
        <li>
          post content that is unlawful, sexually explicit, or infringes someone else&rsquo;s
          rights;
        </li>
        <li>
          attempt to gain unauthorised access to the site, its database, or other users&rsquo;
          accounts, or disrupt the service through automated scraping, denial-of-service, or similar
          activity.
        </li>
      </ul>

      <h2>4. League play and administrator decisions</h2>
      <p>
        Each season has its own published rules covering format, schedule, and roster requirements.
        Those rules form part of these Terms for participants in that season.
      </p>
      <p>
        Match results are reported by team captains and confirmed by administrators. Administrators
        may pause or resume a draft, undo a pick, correct a reported result, resolve a disputed
        match, reschedule fixtures, or remove a player from a season. In matters of league
        competition, administrator decisions are final. Spicy League is played for fun &mdash; there
        is no entry fee and no prize money.
      </p>

      <h2>5. Linked game accounts</h2>
      <p>
        You may optionally link a Riot ID, Steam ID, Leetify profile, or OP.GG page to your profile.
        Linking is entirely your choice and can be undone at any time from your profile page. When
        you link a Riot account, we retrieve publicly available ranked and champion-mastery data
        from the Riot Games API to display on your profile. Only link accounts that belong to you.
      </p>

      <h2>6. Your content</h2>
      <p>
        You keep ownership of the content you submit &mdash; your bio, pronouns, team name, signup
        notes, and match reports. By submitting it, you grant us a non-exclusive, worldwide,
        royalty-free licence to host, display, and reproduce that content for the purpose of running
        and promoting the league, including publishing it on the site and in our Discord server.
        This licence ends when you remove the content, except for copies already distributed (for
        example, a message our bot has already posted to Discord).
      </p>

      <h2>7. Discord</h2>
      <p>
        We operate a Discord bot that posts league updates &mdash; such as draft picks, schedules,
        and results &mdash; into the Spicy League Discord server, and that can read messages in the
        channels it has been granted access to. Use of Discord itself is governed by Discord&rsquo;s
        terms, not ours. How the bot handles data is described in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>8. Availability</h2>
      <p>
        Spicy League is a hobby project run by volunteers. We provide the service &ldquo;as
        is&rdquo; and &ldquo;as available&rdquo;, without warranties of any kind, whether express or
        implied. We do not guarantee uptime, that the site will be error-free, that stats retrieved
        from third-party APIs will be accurate or current, or that data will never be lost. We may
        change, suspend, or discontinue any part of the service at any time.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, Spicy League and its organisers will not be liable
        for any indirect, incidental, special, consequential, or punitive damages, or for any loss
        of data, profits, or goodwill, arising out of your use of the service. Nothing in these
        Terms limits liability that cannot be limited under applicable law.
      </p>

      <h2>10. Suspension and termination</h2>
      <p>
        We may suspend or terminate your account if you breach these Terms or the rules of a season.
        You may stop using Spicy League at any time and request deletion of your account as
        described in our <Link href="/privacy">Privacy Policy</Link>. Removing a player mid-season
        may affect their team, so we will generally resolve competitive matters at a season boundary
        where practical.
      </p>

      <h2>11. Third-party trademarks</h2>
      <p>
        Spicy League is not endorsed by Riot Games and does not reflect the views or opinions of
        Riot Games or anyone officially involved in producing or managing Riot Games properties.
        Riot Games, League of Legends, and all associated properties are trademarks or registered
        trademarks of Riot Games, Inc. Counter-Strike and Steam are trademarks of Valve Corporation.
        Discord is a trademark of Discord Inc. We are not affiliated with any of them.
      </p>

      <h2>12. Changes to these Terms</h2>
      <p>
        We may update these Terms as the league evolves. The &ldquo;last updated&rdquo; date at the
        top of this page reflects the most recent version. If we make a material change, we will
        announce it in the Spicy League Discord. Continuing to use the service after a change means
        you accept the updated Terms.
      </p>

      <h2>13. Contact</h2>
      <p>
        Questions about these Terms can be sent to{" "}
        <a href="mailto:contact@spicyleague.dev">contact@spicyleague.dev</a>.
      </p>
    </LegalPage>
  );
}
