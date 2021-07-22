import {
  ClientSideBasePluginConfig,
  ClientSideBaseVisitor,
  LoadedFragment,
} from '@graphql-codegen/visitor-plugin-common';
import autoBind from 'auto-bind';
import { camelCase } from 'change-case-all';
import { GraphQLSchema, Kind, OperationDefinitionNode, print } from 'graphql';
import { RawGraphQLApolloPluginConfig } from './config';

export interface GraphQLRequestPluginConfig extends ClientSideBasePluginConfig {
  rawRequest: boolean;
}

export class GraphQLApolloVisitor extends ClientSideBaseVisitor<
  RawGraphQLApolloPluginConfig,
  GraphQLRequestPluginConfig
> {
  private _operationsToInclude: {
    node: OperationDefinitionNode;
    documentVariableName: string;
    operationType: string;
    operationResultType: string;
    operationVariablesTypes: string;
  }[] = [];

  constructor(schema: GraphQLSchema, fragments: LoadedFragment[], rawConfig: RawGraphQLApolloPluginConfig) {
    super(schema, fragments, rawConfig, {});

    autoBind(this);

    const typeImport = this.config.useTypeImports ? 'import type' : 'import';

    this._additionalImports.push(`${typeImport} { ApolloClient } from '@apollo/client';`);
    this._additionalImports.push(`${typeImport} * as Apollo from '@apollo/client';`);
  }

  public OperationDefinition(node: OperationDefinitionNode) {
    const operationName = node.name?.value;

    if (!operationName) {
      // eslint-disable-next-line no-console
      console.warn(
        `Anonymous GraphQL operation was ignored in "typescript-graphql-request", please make sure to name your operation: `,
        print(node)
      );

      return null;
    }

    return super.OperationDefinition(node);
  }

  protected buildOperation(
    node: OperationDefinitionNode,
    documentVariableName: string,
    operationType: string,
    operationResultType: string,
    operationVariablesTypes: string
  ): string {
    this._operationsToInclude.push({
      node,
      documentVariableName,
      operationType,
      operationResultType,
      operationVariablesTypes,
    });

    return null;
  }

  public get sdkContent(): string {
    const sdkOperations = this._operationsToInclude.map(
      ({ node, documentVariableName, operationType, operationResultType, operationVariablesTypes }) => {
        const optionalVariables =
          !node.variableDefinitions ||
          node.variableDefinitions.length === 0 ||
          node.variableDefinitions.every(v => v.type.kind !== Kind.NON_NULL_TYPE || v.defaultValue);

        const operationName = node.name.value;
        const operationGenerics = `${operationResultType}, ${operationVariablesTypes}`;
        const optionQueryKey = operationType === 'Mutation' ? 'mutation' : 'query';

        return `${camelCase(operationName)}${operationType}(options${
          optionalVariables ? '?' : ''
        }: ${GraphQLApolloVisitor.getApolloOperationOptionType(operationType)}<${operationGenerics}>) {
          return client.${GraphQLApolloVisitor.getApolloOperation(
            operationType
          )}<${operationGenerics}>({...options, ${optionQueryKey}: ${documentVariableName}})
      }`;
      }
    );
    return `export const getSdk = (client: ApolloClient<any>) => ({
      ${sdkOperations.join(',\n')}
    });
    export type SdkType = ReturnType<typeof getSdk>
`;
  }
  private static getApolloOperation(operationType: string): string {
    switch (operationType) {
      case 'Subscription':
        return 'subscribe';
      case 'Mutation':
        return 'mutate';
      case 'Query':
        return 'query';
      default:
        throw new Error('unknown operation type: ' + operationType);
    }
  }

  private static getApolloOperationOptionType(operationType: string): string {
    switch (operationType) {
      case 'Subscription':
        return 'Apollo.SubscriptionOptions';
      case 'Mutation':
        return 'Apollo.MutationOptions';
      case 'Query':
        return 'Apollo.QueryOptions';
      default:
        throw new Error('unknown operation type: ' + operationType);
    }
  }
}
