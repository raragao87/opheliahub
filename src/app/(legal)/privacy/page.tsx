export const metadata = { title: "Privacy Policy — OpheliaHub" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: 13 June 2026</p>

      <p>
        OpheliaHub is a personal and family finance management application. This policy explains
        what data the app handles and how it is used.
      </p>

      <h2>Who this applies to</h2>
      <p>
        OpheliaHub is operated privately for the use of its account holders and their household
        members. It is not a public service and does not sell access to third parties.
      </p>

      <h2>Data we process</h2>
      <ul>
        <li>Account profile information from your sign-in provider (name, email, profile image).</li>
        <li>
          Financial data you enter or import: accounts, transactions, balances, categories, budgets,
          tags, and investment holdings.
        </li>
        <li>
          Bank account information you choose to connect via PSD2 open banking (account details and
          transaction history), retrieved on your behalf through a licensed account-information
          service provider.
        </li>
      </ul>

      <h2>How bank connections work</h2>
      <p>
        When you connect a bank, you authorize access directly with your bank. OpheliaHub never sees
        or stores your bank login credentials. Account access is performed through Enable Banking
        (a licensed AISP) using read-only Account Information Services (AIS); OpheliaHub does not
        initiate payments. You can disconnect a bank at any time, and bank consent expires
        automatically and must be renewed periodically as required by law.
      </p>

      <h2>How your data is used</h2>
      <p>
        Your data is used solely to provide the app&apos;s features to you — displaying balances,
        categorizing transactions, tracking budgets and net worth, and importing transactions. Data
        is shared only between members of your own household where you have enabled shared accounts.
        It is not sold or shared with advertisers or other third parties.
      </p>

      <h2>Storage and retention</h2>
      <p>
        Data is stored in a private database and retained while your account is active. You can
        delete transactions, disconnect banks, or delete your account, which removes your associated
        data.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Disconnect any bank connection at any time from Settings.</li>
        <li>Delete individual records or your entire account.</li>
        <li>Contact the operator for any data request.</li>
      </ul>

      <h2>Contact</h2>
      <p>For privacy questions, contact the account operator at roberto.b.a.aragao@gmail.com.</p>
    </>
  );
}
