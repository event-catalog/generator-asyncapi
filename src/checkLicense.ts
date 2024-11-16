import chalk from 'chalk';

export default () => {
  console.log(chalk.bgBlue(`\nYou are using the open source license for this plugin`));
  console.log(
    chalk.blueBright(
      `This plugin is governed and published under a dual-license. \nIf using for internal, commercial or proprietary software, you can purchase a license at https://dashboard.eventcatalog.dev/ or contact us hello@eventcatalog.dev.`
    )
  );
};
