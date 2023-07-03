/* 
    RPC: account_info
    Version: 22.0+
    Docs: https://docs.nano.org/commands/rpc-protocol/#account_info

    Optionals included:
    - include_confirmed: true
    - representative: true
    - weight: true
    - receivable: true

    * Ignoring "pending" fields, since the term was deprecated in favor of receivable
    * Ignoring fields with prefix "confirmation_" in favor of "_confirmed" for consistency
 */
export interface AccountInfoResponse {
    frontier: string;
    open_block: string;
    representative_block: string;
    balance: string;
    modified_timestamp: string;
    block_count: string;
    weight: string;
    account_version: string;

    confirmed_balance: string;
    confirmed_height: string;
    confirmed_frontier: string;

    representative: string;
    confirmed_representative: string;

    receivable: string,
    confirmed_pending: 0,
    confirmed_receivable: 0
}

export interface AccountBalanceResponse {
    balance: string;
    receivable: string;
}

export interface ReceivableWithThreshold {
    blocks: Record<string, string>
}