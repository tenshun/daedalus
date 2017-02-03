// @flow
import { action, observable } from 'mobx';
import { ipcRenderer } from 'electron';
import { isString } from 'lodash';
import Store from './lib/Store';
import Request from './lib/Request';
import { PARSE_REDEMPTION_CODE } from '../../electron/ipc-api/parse-redemption-code-from-pdf';
import LocalizableError from '../i18n/LocalizableError';
import { InvalidMnemonicError } from '../i18n/global-errors';

export class AdaRedemptionCertificateParseError extends LocalizableError {
  constructor() {
    super({
      id: 'errors.AdaRedemptionCertificateParseError',
      defaultMessage: '!!!The ADA redemption code could not be parsed from the given document.',
    });
  }
}

export default class AdaRedemptionStore extends Store {

  @observable certificate: File = null;
  @observable isCertificateEncrypted = false;
  @observable passPhrase: string = null;
  @observable redemptionCode: string = '';
  @observable walletId: string = null;
  @observable error: LocalizableError = null;
  @observable redeemAdaRequest = new Request(this.api, 'redeemAda');

  constructor(...args) {
    super(...args);
    this.actions.setRedemptionCertificate.listen(this._setCertificate);
    this.actions.setRedemptionPassPhrase.listen(this._setPassPhrase);
    this.actions.setRedemptionCode.listen(this._setRedemptionCode);
    this.actions.redeemAda.listen(this._redeemAda);
    this.actions.adaSuccessfullyRedeemed.listen(this._redirectToRedeemWallet);
    ipcRenderer.on(PARSE_REDEMPTION_CODE.SUCCESS, this._onCodeParsed);
    ipcRenderer.on(PARSE_REDEMPTION_CODE.ERROR, this._onParseError);
  }

  _setCertificate = action(({ certificate }) => {
    this.certificate = certificate;
    this.isCertificateEncrypted = certificate.type !== 'application/pdf';
    if (this.isCertificateEncrypted && !this.passPhrase) return; // We cannot decrypt it yet!
    this._parseCodeFromCertificate();
  });

  _setPassPhrase = action(({ passPhrase }) => {
    this.passPhrase = passPhrase;
    this._parseCodeFromCertificate();
  });

  _setRedemptionCode = action(({ redemptionCode }) => {
    this.redemptionCode = redemptionCode;
  });

  _parseCodeFromCertificate() {
    console.debug('Parsing ADA Redemption code from certificate', this.certificate.path);
    ipcRenderer.send(PARSE_REDEMPTION_CODE.REQUEST, this.certificate.path, this.passPhrase);
  }

  _onCodeParsed = action((event, code) => {
    console.debug('Redemption code parsed from certificate:', code);
    this.redemptionCode = code;
  });

  _onParseError = action((event, error) => {
    console.error('Error while parsing certificate:', error);
    const errorMessage = isString(error) ? error : error.message;
    if (errorMessage.includes('Invalid mnemonic')) {
      this.error = new InvalidMnemonicError();
    } else {
      this.error = new AdaRedemptionCertificateParseError();
    }
  });

  _redeemAda = action(({ redemptionCode, walletId }) => {
    this.walletId = walletId;
    this.redemptionCode = redemptionCode;
    this.redeemAdaRequest.execute(this.redemptionCode, this.walletId)
      .then(action(() => {
        this.error = null;
        this.actions.adaSuccessfullyRedeemed();
      }))
      .catch(action((error) => {
        this.error = error;
      }));
  });

  _redirectToRedeemWallet = () => {
    console.debug('ADA redeemed for wallet', this.walletId);
  }

}
