import chalk from 'chalk';
import pkg from '../../package.json';

type LicenseResponse = {
  is_trial: boolean;
  plugin: string;
  state: string;
};

export default async (licenseKey?: string) => {
  const LICENSE_KEY = process.env.EVENTCATALOG_LICENSE_KEY_ASYNCAPI || licenseKey || null;

  if (!LICENSE_KEY) {
    console.log(chalk.bgRed(`\nThis plugin requires a license key to use`));
    console.log(chalk.redBright(`\nVisit https://eventcatalog.cloud/ to get a 14 day trial or purchase a license`));
    process.exit(1);
  }

  // Verify the license key
  const response = await fetch('https://api.eventcatalog.cloud/functions/v1/license', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${LICENSE_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (response.status !== 200) {
    console.log(chalk.bgRed(`\nInvalid license key`));
    console.log(chalk.redBright('Please check your plugin license key or purchase a license at https://eventcatalog.cloud/'));
    process.exit(1);
  }

  if (response.status === 200) {
    const data = (await response.json()) as LicenseResponse;

    // @ts-ignore
    if (pkg.name !== data.plugin) {
      console.log(chalk.bgRed(`\nInvalid license key for this plugin`));
      console.log(chalk.redBright('Please check your plugin license key or purchase a license at https://eventcatalog.cloud/'));
      process.exit(1);
    }

    if (data.is_trial) {
      console.log(chalk.bgBlue(`\nYou are using a trial license for this plugin`));
    }
  }

  return Promise.resolve();
};
