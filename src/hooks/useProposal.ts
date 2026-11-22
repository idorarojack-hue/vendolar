import { useEffect, useState } from 'react';
import { TContractParams, toContractParameters } from '@/services/vindolar/contracts';
import { marketData } from '@/services/vindolar/market-data';
import { isLoggedInForTrading, subscribeAuthenticatedProposal } from '@/services/vindolar/trading';
import { useMarketDataStatus } from './useMarketData';

export type TProposalState = {
    is_loading: boolean;
    error?: string;
    payout?: number;
    ask_price?: number;
    /** Accumulators: highest possible payout and number of ticks. */
    max_payout?: number;
    max_ticks?: number;
    longcode?: string;
};

/**
 * Live price quote (payout) for a contract, kept up to date while inputs stay the same.
 * When `is_logged_in`, quotes come from the logged-in connection so they match what a trade pays;
 * otherwise from the public connection (works before login). Pass `null` to pause.
 */
export const useProposal = (
    params: TContractParams | null,
    { is_logged_in = false, debounce_ms = 250 }: { is_logged_in?: boolean; debounce_ms?: number } = {}
): TProposalState => {
    const [state, setState] = useState<TProposalState>({ is_loading: true });
    const is_connected = useMarketDataStatus();
    const key = params ? JSON.stringify(params) : '';

    useEffect(() => {
        if (!params) return undefined;
        setState({ is_loading: true });
        let unsubscribe: () => void = () => undefined;

        const timer = setTimeout(() => {
            const request = { proposal: 1, ...toContractParameters(params) };
            const use_logged_in = is_logged_in && isLoggedInForTrading();
            const subscribe = use_logged_in ? subscribeAuthenticatedProposal : marketData.subscribe.bind(marketData);
            unsubscribe = subscribe(request, data => {
                if (data.error) {
                    setState({ is_loading: false, error: data.error.message ?? 'This contract is not available.' });
                    return;
                }
                const proposal = data.proposal;
                if (!proposal) return;
                setState({
                    is_loading: false,
                    payout: Number(proposal.payout),
                    ask_price: Number(proposal.ask_price),
                    max_payout: proposal.contract_details?.maximum_payout,
                    max_ticks: proposal.contract_details?.maximum_ticks,
                    longcode: proposal.longcode,
                });
            });
        }, debounce_ms);

        return () => {
            clearTimeout(timer);
            unsubscribe();
        };
        // `key` captures every field of `params`; `is_connected` re-subscribes after a reconnect.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, is_connected, is_logged_in, debounce_ms]);

    return state;
};
